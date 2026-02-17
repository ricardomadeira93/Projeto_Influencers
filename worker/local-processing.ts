import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import axios from "axios";
import FormData from "form-data";
import { runFfmpeg } from "@/worker/ffmpeg";
import { FinalizeExport, WorkerJob, updateJobProgress } from "./local-db";

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type TranscriptWord = {
  start: number;
  end: number;
  word: string;
};

type TranscriptionResult = {
  text: string;
  durationSec: number;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
};

type ClipSegment = {
  clip_id: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
};

type CaptionPreset = "BOLD" | "CLEAN";
type OutputPreset = "INSTAGRAM_REELS" | "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM_FEED";

const OUTPUT_DIMENSIONS: Record<OutputPreset, { width: number; height: number }> = {
  INSTAGRAM_REELS: { width: 1080, height: 1920 },
  YOUTUBE_SHORTS: { width: 1080, height: 1920 },
  TIKTOK: { width: 1080, height: 1920 },
  INSTAGRAM_FEED: { width: 1080, height: 1350 }
};

const DEFAULT_OUTPUT_PRESET: OutputPreset = "INSTAGRAM_REELS";
const DEFAULT_CAPTION_PRESET: CaptionPreset = "BOLD";

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : fallback;
}

const MIN_SEGMENT_SEC = readPositiveIntEnv("CLIP_MIN_SECONDS", 20);
const MAX_SEGMENT_SEC = Math.max(MIN_SEGMENT_SEC, readPositiveIntEnv("CLIP_MAX_SECONDS", 30));
const TARGET_SEGMENT_SEC = Math.max(
  MIN_SEGMENT_SEC,
  Math.min(MAX_SEGMENT_SEC, readPositiveIntEnv("CLIP_TARGET_SECONDS", 26))
);
const MAX_CLIPS = readPositiveIntEnv("CLIP_MAX_COUNT", 3);
const OUTPUT_LANGUAGE = process.env.AI_OUTPUT_LANGUAGE || "pt-BR";
const TRANSCRIBE_LANGUAGE = process.env.TRANSCRIBE_LANGUAGE || "pt";
const EXPORT_TTL_SECONDS = 72 * 3600;

const CLIP_JSON_SCHEMA = {
  name: "clip_suggestions",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      segments: {
        type: "array",
        maxItems: MAX_CLIPS,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            start: { type: "number" },
            end: { type: "number" },
            title: { type: "string" },
            hook: { type: "string" },
            reason: { type: "string" }
          },
          required: ["start", "end", "title", "hook", "reason"]
        }
      }
    },
    required: ["segments"]
  },
  strict: true
} as const;

function getTranscribeProvider() {
  const value = (process.env.TRANSCRIBE_PROVIDER || "stub").trim().toLowerCase();
  if (value !== "stub" && value !== "openai" && value !== "faster_whisper") {
    throw new Error(`Invalid TRANSCRIBE_PROVIDER "${value}". Use "stub", "openai", or "faster_whisper".`);
  }
  return value;
}

function getSegmentProvider() {
  const value = (process.env.SEGMENT_PROVIDER || "ollama").trim().toLowerCase();
  if (value !== "ollama" && value !== "openai") {
    throw new Error(`Invalid SEGMENT_PROVIDER "${value}". Use "ollama" or "openai".`);
  }
  return value;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function isMissingSubtitlesFilterError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("no such filter: 'subtitles'") ||
    message.includes("no such filter: 'ass'") ||
    message.includes("filter not found")
  );
}

let ffmpegSubtitlesSupport: boolean | null = null;
const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";

async function detectFfmpegSubtitlesSupport() {
  if (ffmpegSubtitlesSupport !== null) return ffmpegSubtitlesSupport;

  ffmpegSubtitlesSupport = await new Promise<boolean>((resolve) => {
    const child = spawn(FFMPEG_BIN, ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (code !== 0) return resolve(false);
      const all = `${stdout}\n${stderr}`;
      resolve(/\bsubtitles\b/.test(all) || /\bass\b/.test(all));
    });
  });

  return ffmpegSubtitlesSupport;
}

function getOpenAiApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is required when using OpenAI providers.");
  }
  return key;
}

function createOpenAiHttp() {
  return axios.create({
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    timeout: 180_000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`
    }
  });
}

async function openAiTranscribeAudio(filePath: string) {
  const http = createOpenAiHttp();
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", createReadStream(filePath));
  form.append("response_format", "verbose_json");
  form.append("language", TRANSCRIBE_LANGUAGE);

  const { data } = await http.post<{
    text?: string;
    duration?: number;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
    words?: Array<{ start?: number; end?: number; word?: string }>;
  }>("/audio/transcriptions", form, {
    headers: form.getHeaders()
  });

  return data;
}

async function fasterWhisperTranscribeAudio(filePath: string) {
  const scriptPath = path.join(process.cwd(), "worker", "scripts", "faster_whisper_transcribe.py");
  const model = process.env.FASTER_WHISPER_MODEL || "small";
  const computeType = process.env.FASTER_WHISPER_COMPUTE_TYPE || "int8";

  return new Promise<{
    text?: string;
    duration?: number;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
    words?: Array<{ start?: number; end?: number; word?: string }>;
  }>((resolve, reject) => {
    const args = [
      scriptPath,
      "--audio",
      filePath,
      "--model",
      model,
      "--language",
      TRANSCRIBE_LANGUAGE,
      "--compute-type",
      computeType
    ];
    const child = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`faster_whisper failed (${code}): ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as {
          text?: string;
          duration?: number;
          segments?: Array<{ start?: number; end?: number; text?: string }>;
          words?: Array<{ start?: number; end?: number; word?: string }>;
        });
      } catch (error) {
        reject(new Error(`Could not parse faster_whisper JSON output: ${getErrorMessage(error)}`));
      }
    });
  });
}

async function openAiSelectSegments(payload: {
  transcriptText: string;
  durationSec: number;
  transcriptTimeline: string;
  candidateSummary: string;
}) {
  const http = createOpenAiHttp();
  const { data } = await http.post<{
    choices?: Array<{ message?: { content?: string | null } }>;
  }>("/chat/completions", {
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_schema", json_schema: CLIP_JSON_SCHEMA },
    messages: [
      {
        role: "system",
        content:
          `Você é editor especialista em viralização para Instagram/Reels. Selecione somente momentos com propósito claro de engajamento: gancho forte nos primeiros segundos, valor prático, curiosidade, conflito/erro/solução ou resultado concreto. Regras: NÃO dividir o vídeo em partes uniformes; NÃO escolher momentos aleatórios; NÃO cortar no meio de frase; iniciar e terminar segmentos em fronteiras naturais de fala; cada segmento entre ${MIN_SEGMENT_SEC} e ${MAX_SEGMENT_SEC} segundos; no máximo ${MAX_CLIPS} segmentos; resposta em ${OUTPUT_LANGUAGE}.`
      },
      {
        role: "user",
        content:
          `Duração do vídeo: ${payload.durationSec} segundos.\nIdioma esperado: ${OUTPUT_LANGUAGE}.\n` +
          `Transcrição com timestamps:\n${payload.transcriptTimeline}\n\n` +
          `Candidatos pré-selecionados por engajamento:\n${payload.candidateSummary}\n\n` +
          `Retorne apenas os melhores candidatos para maximizar views e retenção.`
      }
    ]
  });

  return data;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function parseCropConfig(input: unknown): { captionPreset: CaptionPreset; outputPreset: OutputPreset } {
  if (!input || typeof input !== "object") {
    return { captionPreset: DEFAULT_CAPTION_PRESET, outputPreset: DEFAULT_OUTPUT_PRESET };
  }

  const raw = input as Record<string, unknown>;
  const captionPreset = raw.captionPreset === "CLEAN" ? "CLEAN" : "BOLD";
  const outputPreset = (["INSTAGRAM_REELS", "YOUTUBE_SHORTS", "TIKTOK", "INSTAGRAM_FEED"] as const).includes(
    raw.outputPreset as OutputPreset
  )
    ? (raw.outputPreset as OutputPreset)
    : DEFAULT_OUTPUT_PRESET;

  return { captionPreset, outputPreset };
}

function toSrtTs(sec: number) {
  const ms = Math.floor((sec % 1) * 1000);
  const total = Math.floor(sec);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function toAssTs(sec: number) {
  const safe = Math.max(0, sec);
  const totalCs = Math.floor(safe * 100);
  const cs = totalCs % 100;
  const total = Math.floor(totalCs / 100);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeForFilterPath(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function splitTextIntoTranscriptSegments(text: string, durationSec: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [] as TranscriptSegment[];

  const chunkWords = 8;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkWords) {
    chunks.push(words.slice(i, i + chunkWords).join(" "));
  }

  const safeDuration = Math.max(MIN_SEGMENT_SEC, durationSec || MIN_SEGMENT_SEC);
  const secPerChunk = safeDuration / chunks.length;

  return chunks.map((chunk, idx) => {
    const start = idx * secPerChunk;
    const end = idx === chunks.length - 1 ? safeDuration : (idx + 1) * secPerChunk;
    return {
      start,
      end,
      text: chunk
    };
  });
}

function assStyleLine(preset: CaptionPreset, height: number) {
  if (preset === "CLEAN") {
    return `Style: Default,Arial,44,&H00FFFFFF,&H000000FF,&H00202020,&H64000000,0,0,0,0,100,100,0,0,1,1.6,0,2,72,72,${Math.max(54, Math.round(height * 0.05))},1`;
  }
  return `Style: Default,Arial Bold,56,&H00FFFFFF,&H0000D7FF,&H00121212,&H78000000,1,0,0,0,100,100,0,0,3,2.4,0,2,72,72,${Math.max(72, Math.round(height * 0.065))},1`;
}

function escapeAssText(text: string) {
  return text.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N").replace(/\\/g, "\\\\");
}

function assAnimationTag(preset: CaptionPreset) {
  if (preset === "CLEAN") {
    return "{\\fad(70,120)\\t(0,180,\\fscx104\\fscy104)\\t(180,320,\\fscx100\\fscy100)}";
  }
  return "{\\fad(90,140)\\t(0,220,\\fscx110\\fscy110)\\t(220,420,\\fscx100\\fscy100)}";
}

function normalizePortugueseTitle(value: string, index: number) {
  const trimmed = value.trim();
  if (!trimmed) return `Clipe ${index}`;

  const normalized = trimmed
    .replace(/^clip\b[:\s-]*/i, "Clipe ")
    .replace(/^highlight\b[:\s-]*/i, "Destaque ")
    .replace(/^best part\b[:\s-]*/i, "Melhor momento ")
    .replace(/^key moment\b[:\s-]*/i, "Momento-chave ");

  if (/^clipe\s*$/i.test(normalized)) return `Clipe ${index}`;
  return normalized;
}

function normalizePortugueseSentence(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed
    .replace(/why this clip works[:\s-]*/gi, "Por que este clipe funciona: ")
    .replace(/this clip/gi, "este clipe")
    .replace(/\bclip\b/gi, "clipe");
}

function normalizeTranscriptSegments(
  raw: Array<{ start?: number; end?: number; text?: string }>,
  durationSec: number
) {
  const safeDuration = Math.max(1, durationSec || 1);
  return raw
    .map((segment) => {
      const start = Number(segment.start || 0);
      const end = Number(segment.end || segment.start || 0);
      return {
        start: clamp(Number.isFinite(start) ? start : 0, 0, safeDuration),
        end: clamp(Number.isFinite(end) ? end : 0, 0, safeDuration),
        text: String(segment.text || "").trim()
      };
    })
    .filter((segment) => segment.end > segment.start && segment.text.length > 0);
}

function normalizeTranscriptWords(
  raw: Array<{ start?: number; end?: number; word?: string }>,
  durationSec: number
) {
  const safeDuration = Math.max(1, durationSec || 1);
  return raw
    .map((word) => {
      const start = Number(word.start || 0);
      const end = Number(word.end || word.start || 0);
      return {
        start: clamp(Number.isFinite(start) ? start : 0, 0, safeDuration),
        end: clamp(Number.isFinite(end) ? end : 0, 0, safeDuration),
        word: String(word.word || "").trim()
      };
    })
    .filter((word) => word.end > word.start && word.word.length > 0);
}

async function detectSilenceBoundaries(audioPath: string) {
  return new Promise<number[]>((resolve) => {
    const args = ["-hide_banner", "-i", audioPath, "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"];
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => resolve([]));
    child.on("close", () => {
      const points = new Set<number>();
      const startRegex = /silence_start:\s*([0-9.]+)/g;
      const endRegex = /silence_end:\s*([0-9.]+)/g;
      let match: RegExpExecArray | null;

      while ((match = startRegex.exec(stderr))) {
        const value = Number(match[1]);
        if (Number.isFinite(value)) points.add(value);
      }
      while ((match = endRegex.exec(stderr))) {
        const value = Number(match[1]);
        if (Number.isFinite(value)) points.add(value);
      }
      resolve(Array.from(points).sort((a, b) => a - b));
    });
  });
}

async function loadStubTranscription(durationSec: number) {
  const fallbackPath = path.join(process.cwd(), "dev", "transcripts", "default.json");
  const raw = await fs.readFile(fallbackPath, "utf8");
  const parsed = JSON.parse(raw) as { text?: string };
  const text = String(parsed.text || "").trim();
  if (!text) {
    throw new Error("dev/transcripts/default.json must contain a non-empty \"text\" value.");
  }

  const normalizedDuration = Math.max(MIN_SEGMENT_SEC, Number(durationSec || MIN_SEGMENT_SEC));
  const segments = splitTextIntoTranscriptSegments(text, normalizedDuration);
  return { text, durationSec: normalizedDuration, segments, words: [] } satisfies TranscriptionResult;
}

async function transcribeAudio(audioPath: string, sourceDurationSec: number) {
  const provider = getTranscribeProvider();

  if (provider === "stub") {
    return loadStubTranscription(sourceDurationSec);
  }

  const transcription =
    provider === "faster_whisper"
      ? await fasterWhisperTranscribeAudio(audioPath)
      : await openAiTranscribeAudio(audioPath);

  const durationSec = Number(transcription.duration || sourceDurationSec || MIN_SEGMENT_SEC);
  const text = String(transcription.text || "").trim();
  const normalizedSegments = normalizeTranscriptSegments(
    ((transcription.segments || []) as Array<{ start?: number; end?: number; text?: string }>) || [],
    durationSec
  );
  const normalizedWords = normalizeTranscriptWords(
    ((transcription.words || []) as Array<{ start?: number; end?: number; word?: string }>) || [],
    durationSec
  );

  const segments = normalizedSegments.length
    ? normalizedSegments
    : splitTextIntoTranscriptSegments(text || "No transcript generated.", durationSec);

  return {
    text: text || segments.map((segment) => segment.text).join(" ").trim(),
    durationSec,
    segments,
    words: normalizedWords
  } satisfies TranscriptionResult;
}

function parseJsonObject(input: string) {
  const trimmed = input.trim();
  const withoutFences = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFences) as Record<string, unknown>;
  } catch {
    const start = withoutFences.indexOf("{");
    const end = withoutFences.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = withoutFences.slice(start, end + 1);
      return JSON.parse(slice) as Record<string, unknown>;
    }
    throw new Error("Could not parse JSON response from provider.");
  }
}

function looksLikeHtml(input: string) {
  const trimmed = input.trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function toCandidateSegments(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<Record<string, unknown>>;
  return value.filter((entry) => typeof entry === "object" && entry !== null) as Array<Record<string, unknown>>;
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function overlapRatio(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const intersection = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const minLen = Math.max(1, Math.min(aEnd - aStart, bEnd - bStart));
  return intersection / minLen;
}

function engagementScore(text: string) {
  const t = text.toLowerCase();
  const keywordBoost = [
    "como",
    "passo a passo",
    "erro",
    "segredo",
    "dica",
    "evite",
    "por que",
    "problema",
    "solução",
    "resultado",
    "antes",
    "depois",
    "importante",
    "faça isso",
    "não faça",
    "how to",
    "mistake",
    "secret",
    "tip",
    "step",
    "best",
    "avoid",
    "why",
    "problem",
    "fix",
    "result",
    "before",
    "after",
    "important",
    "do this",
    "don't"
  ].reduce((acc, keyword) => acc + (t.includes(keyword) ? 2 : 0), 0);

  const punctuationBoost = (text.includes("?") ? 1 : 0) + (text.includes("!") ? 1 : 0);
  const hasNumbers = /\d/.test(text) ? 1 : 0;
  const len = text.trim().length;
  const lengthBoost = len >= 35 && len <= 220 ? 1 : 0;
  return keywordBoost + punctuationBoost + hasNumbers + lengthBoost;
}

function timelineLine(start: number, end: number, text: string) {
  return `[${start.toFixed(1)}-${end.toFixed(1)}] ${text}`;
}

function buildTranscriptTimeline(transcriptSegments: TranscriptSegment[]) {
  return transcriptSegments
    .slice(0, 260)
    .map((segment) => timelineLine(segment.start, segment.end, segment.text))
    .join("\n");
}

type EngagementCandidate = {
  start: number;
  end: number;
  score: number;
  snippet: string;
};

function buildEngagementCandidates(transcriptSegments: TranscriptSegment[], durationSec: number) {
  const safeDuration =
    Number.isFinite(durationSec) && durationSec > 0 ? Math.max(MIN_SEGMENT_SEC, durationSec) : MIN_SEGMENT_SEC;
  const candidates: EngagementCandidate[] = [];

  for (const segment of transcriptSegments) {
    const center = (segment.start + segment.end) / 2;
    const maxStart = Math.max(0, safeDuration - MIN_SEGMENT_SEC);
    const start = clamp(center - TARGET_SEGMENT_SEC / 2, 0, maxStart);
    const end = Math.min(safeDuration, start + TARGET_SEGMENT_SEC);

    const inWindow = transcriptSegments.filter((s) => s.end > start && s.start < end);
    const joined = inWindow.map((s) => s.text).join(" ").trim();
    const densityBoost = inWindow.length >= 4 ? 1.5 : inWindow.length >= 2 ? 0.8 : 0;
    const score = engagementScore(joined || segment.text) + densityBoost;

    candidates.push({
      start,
      end,
      score,
      snippet: (joined || segment.text).slice(0, 180)
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected: EngagementCandidate[] = [];
  for (const candidate of candidates) {
    const overlaps = selected.some((s) => overlapRatio(candidate.start, candidate.end, s.start, s.end) > 0.45);
    if (overlaps) continue;
    selected.push(candidate);
    if (selected.length >= Math.max(8, MAX_CLIPS * 3)) break;
  }

  return selected;
}

function buildCandidateSummary(candidates: EngagementCandidate[]) {
  return candidates
    .map((candidate, idx) => {
      return `${idx + 1}) [${candidate.start.toFixed(1)}-${candidate.end.toFixed(1)}] score=${candidate.score.toFixed(
        2
      )} text="${candidate.snippet}"`;
    })
    .join("\n");
}

function heuristicBestSegments(
  transcriptSegments: TranscriptSegment[],
  durationSec: number,
  transcriptText: string
) {
  const safeDuration =
    Number.isFinite(durationSec) && durationSec > 0 ? Math.max(MIN_SEGMENT_SEC, durationSec) : MIN_SEGMENT_SEC;

  if (!transcriptSegments.length) {
    const end = Math.min(safeDuration, Math.max(MIN_SEGMENT_SEC, Math.min(TARGET_SEGMENT_SEC, safeDuration)));
    return [
      {
        start: 0,
        end,
        title: "Momento-chave do tutorial",
        hook: transcriptText.trim().slice(0, 120) || "Trecho com alto valor para engajamento",
        reason: "Segmento selecionado por fallback com base na transcrição."
      }
    ];
  }

  const ranked = transcriptSegments
    .map((segment, idx) => ({
      idx,
      start: segment.start,
      end: segment.end,
      text: segment.text,
      score: engagementScore(segment.text)
    }))
    .sort((a, b) => b.score - a.score);

  const picks: Array<{ start: number; end: number; title: string; hook: string; reason: string }> = [];

  for (const candidate of ranked) {
    const center = (candidate.start + candidate.end) / 2;
    const targetLen = TARGET_SEGMENT_SEC;
    const maxStart = Math.max(0, safeDuration - MIN_SEGMENT_SEC);
    let start = clamp(center - targetLen / 2, 0, maxStart);
    let end = Math.min(safeDuration, start + targetLen);

    if (end - start < MIN_SEGMENT_SEC) {
      end = Math.min(safeDuration, start + MIN_SEGMENT_SEC);
      start = Math.max(0, end - MIN_SEGMENT_SEC);
    }
    if (end - start > MAX_SEGMENT_SEC) {
      end = start + MAX_SEGMENT_SEC;
    }

    const overlapsExisting = picks.some((pick) => overlapRatio(start, end, pick.start, pick.end) > 0.5);
    if (overlapsExisting) continue;

    const sourceText = candidate.text.trim() || transcriptText.trim();
    picks.push({
      start,
      end,
      title: sourceText.slice(0, 70) || `Clipe ${picks.length + 1}`,
      hook: sourceText.slice(0, 140) || "Trecho com grande potencial de retenção",
      reason: "Momento de alto engajamento selecionado por pontuação de contexto e palavras-chave."
    });

    if (picks.length >= MAX_CLIPS) break;
  }

  if (!picks.length) {
    const fallbackEnd = Math.min(safeDuration, Math.max(MIN_SEGMENT_SEC, Math.min(TARGET_SEGMENT_SEC, safeDuration)));
    picks.push({
      start: 0,
      end: fallbackEnd,
      title: "Momento-chave do tutorial",
      hook: transcriptText.trim().slice(0, 120) || "Trecho com alto valor para engajamento",
      reason: "Segmento selecionado por fallback com base na transcrição."
    });
  }

  return picks;
}

function nearestTimestamp(target: number, values: number[], maxShiftSec: number) {
  let best = target;
  let bestDist = Infinity;
  for (const value of values) {
    const dist = Math.abs(value - target);
    if (dist < bestDist && dist <= maxShiftSec) {
      best = value;
      bestDist = dist;
    }
  }
  return best;
}

function endsSentence(text: string) {
  return /[.!?…]["')\]]*\s*$/u.test(text.trim());
}

function startsSentence(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]/u.test(trimmed);
}

function sentenceBoundaryPointsFromWords(words: TranscriptWord[]) {
  const points: number[] = [];
  for (const word of words) {
    if (/[.!?…]["')\]]*$/u.test(word.word.trim())) {
      points.push(word.end);
    }
  }
  return points;
}

function nearestBoundaryBefore(target: number, boundaries: number[], maxShiftSec: number) {
  let best = target;
  let bestDist = Infinity;
  for (const point of boundaries) {
    if (point > target) continue;
    const dist = target - point;
    if (dist <= maxShiftSec && dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

function nearestBoundaryAfter(target: number, boundaries: number[], maxShiftSec: number) {
  let best = target;
  let bestDist = Infinity;
  for (const point of boundaries) {
    if (point < target) continue;
    const dist = point - target;
    if (dist <= maxShiftSec && dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

function alignToSentenceBoundaries(
  start: number,
  end: number,
  transcriptSegments: TranscriptSegment[],
  durationSec: number,
  wordBoundaries: number[]
) {
  if (!transcriptSegments.length) return { start, end };

  const safeDuration = Math.max(MIN_SEGMENT_SEC, durationSec || MIN_SEGMENT_SEC);
  const overlapping = transcriptSegments
    .map((segment, idx) => ({ idx, ...segment }))
    .filter((segment) => segment.end > start && segment.start < end);

  if (!overlapping.length) return { start, end };

  let startIdx = overlapping[0].idx;
  let endIdx = overlapping[overlapping.length - 1].idx;

  while (startIdx > 0) {
    const current = transcriptSegments[startIdx];
    const prev = transcriptSegments[startIdx - 1];
    const shortGap = current.start - prev.end <= 1.3;
    if (!shortGap) break;
    if (startsSentence(current.text)) break;
    startIdx -= 1;
    if (transcriptSegments[endIdx].end - transcriptSegments[startIdx].start >= MAX_SEGMENT_SEC) break;
  }

  while (endIdx < transcriptSegments.length - 1) {
    const current = transcriptSegments[endIdx];
    const next = transcriptSegments[endIdx + 1];
    const shortGap = next.start - current.end <= 1.3;
    if (!shortGap) break;
    if (endsSentence(current.text)) break;
    endIdx += 1;
    if (transcriptSegments[endIdx].end - transcriptSegments[startIdx].start >= MAX_SEGMENT_SEC) break;
  }

  let alignedStart = clamp(transcriptSegments[startIdx].start, 0, safeDuration);
  let alignedEnd = clamp(transcriptSegments[endIdx].end, alignedStart + 0.2, safeDuration);
  if (wordBoundaries.length) {
    alignedStart = nearestBoundaryBefore(alignedStart, wordBoundaries, 1.2);
    alignedEnd = nearestBoundaryAfter(alignedEnd, wordBoundaries, 1.8);
  }

  if (alignedEnd - alignedStart < MIN_SEGMENT_SEC) {
    alignedEnd = Math.min(safeDuration, alignedStart + MIN_SEGMENT_SEC);
    alignedStart = Math.max(0, alignedEnd - MIN_SEGMENT_SEC);
  }
  if (alignedEnd - alignedStart > MAX_SEGMENT_SEC) {
    alignedEnd = alignedStart + MAX_SEGMENT_SEC;
  }

  return { start: alignedStart, end: alignedEnd };
}

function refineSegmentBoundaries(
  start: number,
  end: number,
  transcriptSegments: TranscriptSegment[],
  durationSec: number,
  wordBoundaries: number[],
  silencePoints: number[]
) {
  const safeDuration = Math.max(MIN_SEGMENT_SEC, durationSec || MIN_SEGMENT_SEC);
  if (!transcriptSegments.length) return { start, end };

  const leadIn = 0.6;
  const tailOut = 0.9;
  let refinedStart = Math.max(0, start - leadIn);
  let refinedEnd = Math.min(safeDuration, end + tailOut);

  const starts = transcriptSegments.map((s) => s.start);
  const ends = transcriptSegments.map((s) => s.end);
  refinedStart = nearestTimestamp(refinedStart, starts, 2.8);
  refinedEnd = nearestTimestamp(refinedEnd, ends, 2.8);
  if (silencePoints.length) {
    refinedStart = nearestTimestamp(refinedStart, silencePoints, 1.8);
    refinedEnd = nearestTimestamp(refinedEnd, silencePoints, 2.2);
  }

  if (refinedEnd - refinedStart < MIN_SEGMENT_SEC) {
    refinedEnd = Math.min(safeDuration, refinedStart + MIN_SEGMENT_SEC);
  }
  if (refinedEnd - refinedStart > MAX_SEGMENT_SEC) {
    refinedEnd = refinedStart + MAX_SEGMENT_SEC;
  }
  if (refinedEnd > safeDuration) {
    refinedEnd = safeDuration;
    refinedStart = Math.max(0, refinedEnd - MIN_SEGMENT_SEC);
  }

  return alignToSentenceBoundaries(refinedStart, refinedEnd, transcriptSegments, safeDuration, wordBoundaries);
}

function sanitizeSegments(
  input: Array<Record<string, unknown>>,
  durationSec: number,
  transcriptText: string,
  transcriptSegments: TranscriptSegment[],
  transcriptWords: TranscriptWord[],
  silencePoints: number[]
) {
  const candidates: Array<Record<string, unknown>> = input.length
    ? input
    : heuristicBestSegments(transcriptSegments, durationSec, transcriptText).map((segment) => ({ ...segment }));
  const safeDuration =
    Number.isFinite(durationSec) && durationSec > 0 ? Math.max(MIN_SEGMENT_SEC, durationSec) : MIN_SEGMENT_SEC;
  const wordBoundaries = sentenceBoundaryPointsFromWords(transcriptWords);
  const normalized: ClipSegment[] = [];

  for (const candidate of candidates) {
    const startRaw = readNumber(candidate.start ?? candidate["start_sec"], 0);
    const endRaw = readNumber(candidate.end ?? candidate["end_sec"], startRaw + MIN_SEGMENT_SEC);

    const maxStart = Math.max(0, safeDuration - MIN_SEGMENT_SEC);
    let start = clamp(startRaw, 0, maxStart);
    let end = clamp(endRaw, start + MIN_SEGMENT_SEC, safeDuration);

    if (end - start > MAX_SEGMENT_SEC) {
      end = start + MAX_SEGMENT_SEC;
    }
    if (end - start < MIN_SEGMENT_SEC) {
      end = Math.min(safeDuration, start + MIN_SEGMENT_SEC);
      start = Math.max(0, end - MIN_SEGMENT_SEC);
    }
    if (end <= start) continue;
    const refined = refineSegmentBoundaries(start, end, transcriptSegments, safeDuration, wordBoundaries, silencePoints);
    start = refined.start;
    end = refined.end;
    if (end - start < MIN_SEGMENT_SEC) {
      end = Math.min(safeDuration, start + MIN_SEGMENT_SEC);
    }
    if (end - start > MAX_SEGMENT_SEC) {
      end = start + MAX_SEGMENT_SEC;
    }
    if (end <= start) continue;

    normalized.push({
      clip_id: `clip_${normalized.length + 1}`,
      start,
      end,
      title: normalizePortugueseTitle(String(candidate.title || ""), normalized.length + 1),
      hook: normalizePortugueseSentence(
        String(candidate.hook || ""),
        "Trecho útil com alto potencial de retenção"
      ),
      reason: normalizePortugueseSentence(
        String(candidate.reason || ""),
        "Momento educativo relevante para publicação"
      )
    });

    if (normalized.length >= MAX_CLIPS) break;
  }

  return normalized.filter((segment) => segment.end - segment.start >= MIN_SEGMENT_SEC);
}

function looksLikeEvenSplit(segments: Array<Record<string, unknown>>) {
  if (segments.length < 3) return false;
  const starts = segments
    .map((s) => readNumber(s.start ?? s["start_sec"], 0))
    .sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < starts.length; i += 1) {
    diffs.push(starts[i] - starts[i - 1]);
  }
  if (!diffs.length) return false;
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  if (avg <= 0) return false;
  const variance = diffs.reduce((acc, d) => acc + Math.pow(d - avg, 2), 0) / diffs.length;
  const cv = Math.sqrt(variance) / avg;
  return cv < 0.22;
}

async function selectSegments(
  transcriptText: string,
  durationSec: number,
  transcriptSegments: TranscriptSegment[],
  transcriptWords: TranscriptWord[],
  silencePoints: number[]
) {
  const provider = getSegmentProvider();
  const engagementCandidates = buildEngagementCandidates(transcriptSegments, durationSec);
  const transcriptTimeline = buildTranscriptTimeline(transcriptSegments);
  const candidateSummary = buildCandidateSummary(engagementCandidates);

  if (provider === "openai") {
    const completion = await openAiSelectSegments({
      transcriptText,
      durationSec,
      transcriptTimeline,
      candidateSummary
    });

    const content = completion.choices?.[0]?.message?.content || '{"segments":[]}';
    const parsed = parseJsonObject(content);
    const raw = toCandidateSegments(parsed.segments);
    const sanitized = sanitizeSegments(
      looksLikeEvenSplit(raw) ? [] : raw,
      durationSec,
      transcriptText,
      transcriptSegments,
      transcriptWords,
      silencePoints
    );
    return sanitized.length
      ? sanitized
      : sanitizeSegments([], durationSec, transcriptText, transcriptSegments, transcriptWords, silencePoints);
  }

  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0.2 },
      messages: [
        {
          role: "system",
          content:
            `Você é editor especialista em clips virais para Instagram/Reels. Retorne JSON estrito: {"segments":[{"start":number,"end":number,"title":string,"hook":string,"reason":string}]}. Não divida o vídeo em partes iguais. Não escolha momentos aleatórios. Não corte no meio de frase. Priorize ganchos fortes, conflito, erros comuns, solução clara e resultado. Máximo ${MAX_CLIPS} segmentos, cada um com ${MIN_SEGMENT_SEC}-${MAX_SEGMENT_SEC} segundos. Títulos e hooks em ${OUTPUT_LANGUAGE}.`
        },
        {
          role: "user",
          content:
            `Duração do vídeo: ${durationSec} segundos.\nIdioma esperado: ${OUTPUT_LANGUAGE}.\n` +
            `Transcrição com timestamps:\n${transcriptTimeline}\n\n` +
            `Candidatos pré-selecionados por engajamento:\n${candidateSummary}\n\n` +
            `Retorne apenas os candidatos com maior potencial de views e retenção.`
        }
      ]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama failed (${res.status}): ${body}`);
  }

  const rawBody = await res.text();
  if (looksLikeHtml(rawBody)) {
    throw new Error(
      `OLLAMA_BASE_URL returned HTML instead of JSON. Check OLLAMA_BASE_URL (${baseUrl}) and ensure ollama server is running.`
    );
  }

  let payload: { message?: { content?: string }; response?: string };
  try {
    payload = JSON.parse(rawBody) as { message?: { content?: string }; response?: string };
  } catch {
    throw new Error(
      `Ollama returned invalid JSON. Check OLLAMA_BASE_URL (${baseUrl}) and model (${model}). Response starts with: ${rawBody.slice(0, 120)}`
    );
  }
  const content = payload.message?.content || payload.response || '{"segments":[]}';
  const parsed = parseJsonObject(content);
  const raw = toCandidateSegments(parsed.segments);
  const sanitized = sanitizeSegments(
    looksLikeEvenSplit(raw) ? [] : raw,
    durationSec,
    transcriptText,
    transcriptSegments,
    transcriptWords,
    silencePoints
  );
  return sanitized.length
    ? sanitized
    : sanitizeSegments([], durationSec, transcriptText, transcriptSegments, transcriptWords, silencePoints);
}

async function writeSrtForClip(
  outputPath: string,
  fullTranscriptSegments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number
) {
  const rows = fullTranscriptSegments
    .filter((segment) => segment.end > clipStart && segment.start < clipEnd)
    .map((segment, index) => {
      const start = Math.max(0, segment.start - clipStart);
      const end = Math.max(start + 0.2, Math.min(clipEnd - clipStart, segment.end - clipStart));
      return `${index + 1}\n${toSrtTs(start)} --> ${toSrtTs(end)}\n${segment.text}\n`;
    });

  const safeRows = rows.length
    ? rows
    : [`1\n${toSrtTs(0)} --> ${toSrtTs(Math.max(1, clipEnd - clipStart))}\nLegenda indisponível\n`];
  await fs.writeFile(outputPath, safeRows.join("\n"), "utf8");
}

async function writeAssForClip(
  outputPath: string,
  fullTranscriptSegments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
  preset: CaptionPreset,
  videoHeight: number
) {
  const subtitleSegments = fullTranscriptSegments
    .filter((segment) => segment.end > clipStart && segment.start < clipEnd)
    .map((segment) => ({
      start: Math.max(0, segment.start - clipStart),
      end: Math.max(0.2, Math.min(clipEnd - clipStart, segment.end - clipStart)),
      text: escapeAssText(segment.text)
    }))
    .filter((segment) => segment.end > segment.start);

  const safeSegments = subtitleSegments.length
    ? subtitleSegments
    : [
        {
          start: 0,
          end: Math.max(1, clipEnd - clipStart),
          text: "Legenda indisponível"
        }
      ];

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    `PlayResY: ${videoHeight}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    assStyleLine(preset, videoHeight),
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text"
  ];

  const body = safeSegments.map((segment) => {
    const tag = assAnimationTag(preset);
    return `Dialogue: 0,${toAssTs(segment.start)},${toAssTs(segment.end)},Default,,0,0,0,,${tag}${segment.text}`;
  });

  await fs.writeFile(outputPath, [...header, ...body, ""].join("\n"), "utf8");
}

function hashtagsForText(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("react") || lower.includes("typescript") || lower.includes("javascript")) {
    return ["#programacao", "#dev", "#javascript", "#tutorial", "#aprendizado"];
  }
  return ["#tutorial", "#cortes", "#educacao", "#aprender", "#criador"];
}

type ProcessJobResult = {
  exportsRows: FinalizeExport[];
  transcriptText: string;
  suggestions: ClipSegment[];
};

export async function processClaimedJob(supabase: SupabaseClient, job: WorkerJob): Promise<ProcessJobResult> {
  const tmpDir = path.join("/tmp", job.id);
  const sourcePath = path.join(tmpDir, "source.mp4");
  const audioPath = path.join(tmpDir, "audio.mp3");
  const supportsSubtitles = await detectFfmpegSubtitlesSupport();
  const cropConfig = parseCropConfig(job.cropConfig);
  const targetSize = OUTPUT_DIMENSIONS[cropConfig.outputPreset];

  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    if (!supportsSubtitles) {
      throw new Error(
        "Seu ffmpeg não suporta filtro de legendas (subtitles/libass). Instale um build com libass para gerar clipes com legenda embutida."
      );
    }

    await updateJobProgress(job.id, "DOWNLOADING_SOURCE", 8, "Downloading source video from Supabase.");
    const { data: sourceData, error: sourceError } = await supabase.storage.from("uploads").download(job.sourcePath);
    if (sourceError || !sourceData) {
      throw new Error(sourceError?.message || "Source video not found in uploads bucket.");
    }
    await fs.writeFile(sourcePath, Buffer.from(await sourceData.arrayBuffer()));

    await updateJobProgress(job.id, "EXTRACTING_AUDIO", 20, "Extracting mono 16kHz audio.");
    await runFfmpeg([
      "-y",
      "-i",
      sourcePath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "16k",
      audioPath
    ]);

    await updateJobProgress(job.id, "TRANSCRIBING", 35, "Transcribing audio.");
    const transcription = await transcribeAudio(audioPath, Number(job.sourceDurationSec || 0));
    const silencePoints = await detectSilenceBoundaries(audioPath);

    await updateJobProgress(job.id, "SELECTING_CLIPS", 50, "Selecting best clip segments.");
    const selectedSegments = await selectSegments(
      transcription.text,
      transcription.durationSec,
      transcription.segments,
      transcription.words,
      silencePoints
    );
    if (!selectedSegments.length) {
      throw new Error("No valid segments were produced after validation.");
    }

    const exportsRows: FinalizeExport[] = [];
    const subtitlesBurned = true;
    for (let index = 0; index < selectedSegments.length; index += 1) {
      const segment = selectedSegments[index];
      const clipNumber = index + 1;
      const progress = Math.min(92, 55 + Math.round((clipNumber / selectedSegments.length) * 35));
      await updateJobProgress(job.id, "RENDERING_EXPORTS", progress, `Rendering clip ${clipNumber}/${selectedSegments.length}.`);

      const srtPath = path.join(tmpDir, `${segment.clip_id}.srt`);
      const assPath = path.join(tmpDir, `${segment.clip_id}.ass`);
      const mp4Path = path.join(tmpDir, `${segment.clip_id}.mp4`);
      await writeSrtForClip(srtPath, transcription.segments, segment.start, segment.end);
      await writeAssForClip(assPath, transcription.segments, segment.start, segment.end, cropConfig.captionPreset, targetSize.height);

      const filterWithSubtitles = `setpts=PTS-STARTPTS,scale=${targetSize.width}:${targetSize.height}:force_original_aspect_ratio=increase,crop=${targetSize.width}:${targetSize.height},ass='${escapeForFilterPath(
        assPath
      )}'`;
      const clipDuration = Math.max(0.3, segment.end - segment.start);

      const renderArgs = (filter: string) => [
        "-y",
        "-ss",
        String(segment.start),
        "-t",
        String(clipDuration),
        "-i",
        sourcePath,
        "-vf",
        filter,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        mp4Path
      ];

      try {
        await runFfmpeg(renderArgs(filterWithSubtitles));
      } catch (error) {
        if (isMissingSubtitlesFilterError(error)) {
          throw new Error(
            "Falha ao embutir legendas: ffmpeg sem suporte ao filtro subtitles/libass. Atualize o ffmpeg e tente novamente."
          );
        }
        throw error;
      }

      await updateJobProgress(
        job.id,
        "UPLOADING_EXPORTS",
        Math.min(95, progress + 2),
        `Uploading clip ${clipNumber}/${selectedSegments.length}.`
      );

      const clipObjectPath = `${job.userId}/${job.id}/${segment.clip_id}.mp4`;
      const srtObjectPath = `${job.userId}/${job.id}/${segment.clip_id}.srt`;
      const assObjectPath = `${job.userId}/${job.id}/${segment.clip_id}.ass`;
      const [clipBytes, srtBytes, assBytes] = await Promise.all([
        fs.readFile(mp4Path),
        fs.readFile(srtPath),
        fs.readFile(assPath)
      ]);

      const clipUpload = await supabase.storage.from("exports").upload(clipObjectPath, clipBytes, {
        contentType: "video/mp4",
        upsert: true
      });
      if (clipUpload.error) {
        throw new Error(`Could not upload clip ${segment.clip_id}: ${clipUpload.error.message}`);
      }

      const srtUpload = await supabase.storage.from("exports").upload(srtObjectPath, srtBytes, {
        contentType: "application/x-subrip",
        upsert: true
      });
      if (srtUpload.error) {
        throw new Error(`Could not upload captions ${segment.clip_id}: ${srtUpload.error.message}`);
      }

      const assUpload = await supabase.storage.from("exports").upload(assObjectPath, assBytes, {
        contentType: "text/x-ass",
        upsert: true
      });
      if (assUpload.error) {
        throw new Error(`Could not upload animated captions ${segment.clip_id}: ${assUpload.error.message}`);
      }

      const signed = await supabase.storage.from("exports").createSignedUrl(clipObjectPath, EXPORT_TTL_SECONDS);
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error(`Could not create signed URL for ${segment.clip_id}: ${signed.error?.message || "unknown"}`);
      }

      const hashtags = hashtagsForText(`${segment.title} ${transcription.text.slice(0, 200)}`);
      exportsRows.push({
        jobId: job.id,
        userId: job.userId,
        clipId: segment.clip_id,
        clipPath: clipObjectPath,
        clipUrl: signed.data.signedUrl,
        title: segment.title,
        description: `${segment.hook}\n\nPor que este clipe funciona: ${segment.reason}`,
        hashtags,
        hook: segment.hook,
        reason: segment.reason,
        providerMetadata: {
          subtitles_path: srtObjectPath,
          subtitles_ass_path: assObjectPath,
          subtitles_burned: subtitlesBurned,
          subtitles_animated: true,
          silence_points_count: silencePoints.length,
          transcript_word_count: transcription.words.length,
          caption_preset: cropConfig.captionPreset,
          output_preset: cropConfig.outputPreset,
          providers: {
            transcription: getTranscribeProvider(),
            segments: getSegmentProvider()
          }
        },
        expiresAt: new Date(Date.now() + EXPORT_TTL_SECONDS * 1000)
      });
    }

    await updateJobProgress(job.id, "FINALIZING", 98, "Saving metadata.");
    return {
      exportsRows,
      transcriptText: transcription.text,
      suggestions: selectedSegments
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
