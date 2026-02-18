import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runFfmpeg } from "@/worker/ffmpeg";
import { normalizeTranscript } from "@/lib/selection/normalizeTranscript";
import { generateCandidates } from "@/lib/selection/candidates";
import { rankCandidates, selectWithDiversity } from "@/lib/selection/select";
import {
  DEFAULT_SELECTION_CONFIG,
  type ClipStyleKey,
  type GenreKey,
  type SelectionConfig,
  type SegmentDurationBounds
} from "@/lib/selection/types";
import { scoreSegment } from "@/worker/segment-scoring";
import { isLocalSourcePath, toLocalFilePath } from "@/lib/source-path";
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
  text_excerpt?: string;
  score_total?: number;
  score_grade?: "A" | "B" | "C" | "D";
  score_metrics?: Record<string, number>;
};

type SegmentSelectionConfig = {
  clipStyle?: string | null;
  genre?: string | null;
  clipCount?: number | null;
  clipLengthMaxS?: number | null;
  includeMomentText?: string | null;
  timeframeStartS?: unknown;
  timeframeEndS?: unknown;
};

type EffectiveSelectionConfig = {
  style: ClipStyleKey;
  genre: GenreKey;
  clipCount: number | null;
  includeMomentText: string;
  timeframeStartS: number | null;
  timeframeEndS: number | null;
  bounds: SegmentDurationBounds;
};

type SelectionStageCallback = (stage: string, progress: number) => Promise<void> | void;

type CaptionPreset = "BOLD" | "CLEAN" | "MODERN" | "MINIMAL";
type OutputPreset = "INSTAGRAM_REELS" | "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM_FEED";
type CaptionLanguage =
  | "source"
  | "en"
  | "es"
  | "pt"
  | "fr"
  | "de"
  | "it"
  | "nl"
  | "sv"
  | "no"
  | "da"
  | "fi"
  | "pl"
  | "tr"
  | "cs"
  | "ro"
  | "hu"
  | "uk"
  | "ru"
  | "ar"
  | "hi"
  | "id"
  | "ms"
  | "th"
  | "vi"
  | "ja"
  | "ko"
  | "zh";

const OUTPUT_DIMENSIONS: Record<OutputPreset, { width: number; height: number }> = {
  INSTAGRAM_REELS: { width: 1080, height: 1920 },
  YOUTUBE_SHORTS: { width: 1080, height: 1920 },
  TIKTOK: { width: 1080, height: 1920 },
  INSTAGRAM_FEED: { width: 1080, height: 1350 }
};

const DEFAULT_OUTPUT_PRESET: OutputPreset = "INSTAGRAM_REELS";
const DEFAULT_CAPTION_PRESET: CaptionPreset = "BOLD";
const DEFAULT_CAPTION_LANGUAGE: CaptionLanguage = "source";
const CAPTION_LANGUAGE_SET = new Set<CaptionLanguage>([
  "source",
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "nl",
  "sv",
  "no",
  "da",
  "fi",
  "pl",
  "tr",
  "cs",
  "ro",
  "hu",
  "uk",
  "ru",
  "ar",
  "hi",
  "id",
  "ms",
  "th",
  "vi",
  "ja",
  "ko",
  "zh"
]);

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
const CLIP_SELECTION_QUALITY = (process.env.CLIP_SELECTION_QUALITY || "high").toLowerCase();
const OUTPUT_LANGUAGE = process.env.AI_OUTPUT_LANGUAGE || "pt-BR";
const TRANSCRIBE_LANGUAGE = process.env.TRANSCRIBE_LANGUAGE || "pt";
const EXPORT_TTL_SECONDS = 72 * 3600;

const FILLER_WORDS = new Set([
  "uh",
  "um",
  "ah",
  "eh",
  "hmm",
  "tipo",
  "né",
  "tipo assim",
  "you know",
  "like"
]);

function maxClipCapForDuration(durationSec: number) {
  return durationSec < 20 * 60 ? 8 : 12;
}

function effectiveMaxClips(durationSec: number) {
  return Math.min(MAX_CLIPS, maxClipCapForDuration(durationSec));
}

function getTranscribeProvider() {
  const value = (process.env.TRANSCRIBE_PROVIDER || "stub").trim().toLowerCase();
  if (value !== "stub" && value !== "faster_whisper") {
    throw new Error(`Invalid TRANSCRIBE_PROVIDER "${value}". Use "stub" or "faster_whisper".`);
  }
  return value;
}

function getSegmentProvider() {
  const value = (process.env.SEGMENT_PROVIDER || "ollama").trim().toLowerCase();
  if (value !== "ollama") {
    throw new Error(`Invalid SEGMENT_PROVIDER "${value}". Local mode supports only "ollama".`);
  }
  return value;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
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

type TranslationProvider = "ollama";

function getTranslationProvider(): TranslationProvider {
  return "ollama";
}

function samePrimaryLanguage(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  return a.toLowerCase().split("-")[0] === b.toLowerCase().split("-")[0];
}

function normalizeCaptionLanguage(value: CaptionLanguage) {
  if (value === "source") return "source";
  return value;
}

async function ollamaTranslateCaptionChunk(input: {
  rows: Array<{ i: number; text: string }>;
  targetLanguage: string;
}) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_TRANSLATE_MODEL || process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        {
          role: "system",
          content:
            `Translate subtitle lines into ${input.targetLanguage}. Return ONLY JSON: {"segments":[{"i":number,"text":string}]}. Keep concise subtitle style and punctuation.`
        },
        {
          role: "user",
          content: JSON.stringify({ segments: input.rows })
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama translate failed (${response.status}): ${body}`);
  }

  const rawBody = await response.text();
  if (looksLikeHtml(rawBody)) {
    throw new Error(`OLLAMA_BASE_URL returned HTML for translation. Check OLLAMA_BASE_URL (${baseUrl}).`);
  }
  let payload: { message?: { content?: string }; response?: string };
  try {
    payload = JSON.parse(rawBody) as { message?: { content?: string }; response?: string };
  } catch {
    throw new Error(`Ollama translate returned invalid JSON. Response starts with: ${rawBody.slice(0, 120)}`);
  }
  const content = payload.message?.content || payload.response || '{"segments":[]}';
  const parsed = parseJsonObject(content);
  const rows = Array.isArray(parsed.segments) ? parsed.segments : [];
  return rows
    .filter((row) => typeof row === "object" && row !== null)
    .map((row) => ({
      i: Number((row as Record<string, unknown>).i),
      text: String((row as Record<string, unknown>).text || "")
    }))
    .filter((row) => Number.isInteger(row.i) && row.i >= 0 && row.text.trim().length > 0);
}

async function translateCaptionSegments(
  transcriptSegments: TranscriptSegment[],
  selectedSegments: ClipSegment[],
  captionLanguage: CaptionLanguage
) {
  const targetLanguage = normalizeCaptionLanguage(captionLanguage);
  const provider = getTranslationProvider();
  const model = process.env.OLLAMA_TRANSLATE_MODEL || process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";
  if (targetLanguage === "source") return { translated: false, segments: transcriptSegments, provider, model };
  if (samePrimaryLanguage(targetLanguage, TRANSCRIBE_LANGUAGE)) {
    return { translated: false, segments: transcriptSegments, provider, model };
  }

  const rows = transcriptSegments
    .map((segment, index) => ({
      i: index,
      text: segment.text,
      overlap: selectedSegments.some((pick) => segment.end > pick.start && segment.start < pick.end)
    }))
    .filter((row) => row.overlap)
    .map((row) => ({ i: row.i, text: row.text }));

  if (!rows.length) return { translated: false, segments: transcriptSegments, provider, model };

  const translatedByIndex = new Map<number, string>();
  const chunkSize = 40;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    try {
      const translatedRows = await ollamaTranslateCaptionChunk({ rows: chunk, targetLanguage });
      for (const row of translatedRows) {
        translatedByIndex.set(row.i, row.text.trim());
      }
    } catch {
      continue;
    }
  }

  if (!translatedByIndex.size) {
    return { translated: false, segments: transcriptSegments, provider, model };
  }

  return {
    translated: true,
    provider,
    model,
    segments: transcriptSegments.map((segment, index) => ({
      ...segment,
      text: translatedByIndex.get(index) || segment.text
    }))
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function readOptionalNumber(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "string") {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof input === "object" && input !== null && "toString" in input) {
    const parsed = Number(String(input));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeStyle(raw?: string | null): ClipStyleKey {
  const key = String(raw || "balanced").trim().toLowerCase().replace(/\s+/g, "_");
  if (key === "hooky") return "hooky";
  if (key === "educational") return "educational";
  if (key === "story") return "story";
  return "balanced";
}

function normalizeGenreKey(raw?: string | null): GenreKey {
  const key = String(raw || "other").trim().toLowerCase().replace(/\s+/g, "_");
  if (key === "tutorial") return "tutorial";
  if (key === "podcast") return "podcast";
  if (key === "demo") return "demo";
  if (key === "interview") return "interview";
  if (key === "talking_head") return "talking_head";
  return "other";
}

function resolveStyleBounds(style: ClipStyleKey, userMaxSec?: number | null): SegmentDurationBounds {
  const baseByStyle: Record<ClipStyleKey, SegmentDurationBounds> = {
    hooky: { minSec: 20, targetSec: 30, maxSec: 45 },
    balanced: { minSec: 30, targetSec: 45, maxSec: 60 },
    educational: { minSec: 45, targetSec: 60, maxSec: 90 },
    story: { minSec: 45, targetSec: 75, maxSec: 120 }
  };
  const base = baseByStyle[style];
  const userMax = Number(userMaxSec);
  const maxSec = Number.isFinite(userMax) && userMax > 0 ? Math.min(base.maxSec, Math.round(userMax)) : base.maxSec;
  const minSec = Math.min(base.minSec, Math.max(12, maxSec - 5));
  const targetSec = clamp(base.targetSec, minSec, maxSec);
  return { minSec, targetSec, maxSec };
}

function parseSelectionConfig(input: SegmentSelectionConfig): EffectiveSelectionConfig {
  const style = normalizeStyle(input.clipStyle);
  const genre = normalizeGenreKey(input.genre);
  const clipLengthMaxS = readOptionalNumber(input.clipLengthMaxS);
  const clipCountRaw = readOptionalNumber(input.clipCount);
  const clipCount = clipCountRaw !== null ? Math.max(1, Math.min(10, Math.round(clipCountRaw))) : null;
  const timeframeStartRaw = readOptionalNumber(input.timeframeStartS);
  const timeframeEndRaw = readOptionalNumber(input.timeframeEndS);
  const timeframeStartS = timeframeStartRaw !== null && timeframeStartRaw >= 0 ? timeframeStartRaw : null;
  const timeframeEndS = timeframeEndRaw !== null && timeframeEndRaw >= 0 ? timeframeEndRaw : null;
  const bounds = resolveStyleBounds(style, clipLengthMaxS);
  const includeMomentText = String(input.includeMomentText || "").trim();
  return {
    style,
    genre,
    clipCount,
    includeMomentText,
    timeframeStartS,
    timeframeEndS,
    bounds
  };
}

function scopeTranscriptToTimeframe(
  transcriptSegments: TranscriptSegment[],
  transcriptWords: TranscriptWord[],
  transcriptText: string,
  durationSec: number,
  silencePoints: number[],
  config: EffectiveSelectionConfig
) {
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const hasTimeframe = config.timeframeStartS !== null || config.timeframeEndS !== null;
  if (!hasTimeframe || safeDuration <= 0) {
    return {
      scopedSegments: transcriptSegments,
      scopedWords: transcriptWords,
      scopedText: transcriptText,
      scopedSilencePoints: silencePoints,
      rangeStart: 0,
      rangeEnd: safeDuration || Number.MAX_SAFE_INTEGER
    };
  }
  const rangeStart = clamp(config.timeframeStartS ?? 0, 0, Math.max(0, safeDuration - 0.2));
  const rangeEnd = clamp(config.timeframeEndS ?? safeDuration, rangeStart + 0.2, safeDuration);
  const scopedSegments = transcriptSegments.filter((segment) => segment.end > rangeStart && segment.start < rangeEnd);
  const scopedWords = transcriptWords.filter((word) => word.end > rangeStart && word.start < rangeEnd);
  const scopedSilencePoints = silencePoints.filter((point) => point >= rangeStart && point <= rangeEnd);
  const scopedText = scopedSegments.map((segment) => segment.text).join(" ").trim() || transcriptText;
  return { scopedSegments, scopedWords, scopedText, scopedSilencePoints, rangeStart, rangeEnd };
}

function stylePromptInstruction(style: ClipStyleKey) {
  if (style === "hooky") return "Prioritize strong openings and emotionally engaging hooks.";
  if (style === "educational") return "Prioritize structured explanations and clear teaching moments.";
  if (style === "story") return "Prioritize coherent narrative arcs with emotional continuity.";
  return "Balance hook strength, clarity, and practical value.";
}

function genrePromptInstruction(genre: GenreKey) {
  if (genre === "tutorial") return "Bias toward instructional and actionable moments.";
  if (genre === "podcast") return "Allow conversational flow and context continuity.";
  if (genre === "demo") return "Bias toward product actions and feature walkthrough moments.";
  if (genre === "interview") return "Bias toward clear Q&A exchanges.";
  if (genre === "talking_head") return "Keep neutral talking-head pacing.";
  return "Apply minimal genre bias.";
}

function parseCropConfig(input: unknown): {
  captionPreset: CaptionPreset;
  outputPreset: OutputPreset;
  captionLanguage: CaptionLanguage;
} {
  if (!input || typeof input !== "object") {
    return {
      captionPreset: DEFAULT_CAPTION_PRESET,
      outputPreset: DEFAULT_OUTPUT_PRESET,
      captionLanguage: DEFAULT_CAPTION_LANGUAGE
    };
  }

  const raw = input as Record<string, unknown>;
  const captionPreset = (["BOLD", "CLEAN", "MODERN", "MINIMAL"] as const).includes(raw.captionPreset as CaptionPreset)
    ? (raw.captionPreset as CaptionPreset)
    : DEFAULT_CAPTION_PRESET;
  const outputPreset = (["INSTAGRAM_REELS", "YOUTUBE_SHORTS", "TIKTOK", "INSTAGRAM_FEED"] as const).includes(
    raw.outputPreset as OutputPreset
  )
    ? (raw.outputPreset as OutputPreset)
    : DEFAULT_OUTPUT_PRESET;
  const captionLanguage =
    typeof raw.captionLanguage === "string" && CAPTION_LANGUAGE_SET.has(raw.captionLanguage as CaptionLanguage)
      ? (raw.captionLanguage as CaptionLanguage)
      : DEFAULT_CAPTION_LANGUAGE;

  return { captionPreset, outputPreset, captionLanguage };
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
  if (preset === "MINIMAL") {
    return `Style: Default,Arial,38,&H00FFFFFF,&H000000FF,&H00202020,&H50000000,0,0,0,0,100,100,0,0,1,1.2,0,2,24,24,${Math.max(110, Math.round(height * 0.095))},1`;
  }
  if (preset === "MODERN") {
    return `Style: Default,Arial Rounded MT Bold,50,&H00FFFFFF,&H00D7FF00,&H00101010,&H70000000,1,0,0,0,100,100,0,0,3,2.0,0,2,24,24,${Math.max(126, Math.round(height * 0.105))},1`;
  }
  if (preset === "CLEAN") {
    return `Style: Default,Arial,44,&H00FFFFFF,&H000000FF,&H00202020,&H64000000,0,0,0,0,100,100,0,0,1,1.6,0,2,28,28,${Math.max(120, Math.round(height * 0.1))},1`;
  }
  return `Style: Default,Arial Bold,56,&H00FFFFFF,&H0000D7FF,&H00121212,&H78000000,1,0,0,0,100,100,0,0,3,2.4,0,2,28,28,${Math.max(140, Math.round(height * 0.115))},1`;
}

function escapeAssText(text: string) {
  return text.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N").replace(/\\/g, "\\\\");
}

function assAnimationTag(preset: CaptionPreset) {
  if (preset === "MINIMAL") {
    return "{\\fad(40,80)}";
  }
  if (preset === "MODERN") {
    return "{\\fad(85,120)\\t(0,180,\\fscx108\\fscy108)\\t(180,360,\\fscx100\\fscy100)}";
  }
  if (preset === "CLEAN") {
    return "{\\fad(70,120)\\t(0,180,\\fscx104\\fscy104)\\t(180,320,\\fscx100\\fscy100)}";
  }
  return "{\\fad(90,140)\\t(0,220,\\fscx110\\fscy110)\\t(220,420,\\fscx100\\fscy100)}";
}

function wrapCaptionText(text: string, maxCharsPerLine = 36) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return text.trim();
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      continue;
    }
    current = next;
  }
  if (current) lines.push(current);
  return lines.join("\\N");
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

  const transcription = await fasterWhisperTranscribeAudio(audioPath);

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

type ViralityScore = {
  score: number;
  band: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  breakdown: {
    hook: number;
    value: number;
    pacing: number;
    retention: number;
    clarity: number;
  };
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function scoreWordsPerSecond(wordsPerSecond: number) {
  if (!Number.isFinite(wordsPerSecond) || wordsPerSecond <= 0) return 0.35;
  const ideal = 2.9;
  const dist = Math.abs(wordsPerSecond - ideal);
  if (dist <= 0.4) return 1;
  if (dist <= 0.8) return 0.8;
  if (dist <= 1.2) return 0.6;
  if (dist <= 1.8) return 0.4;
  return 0.2;
}

function computeViralityScore(input: {
  title: string;
  hook: string;
  reason: string;
  segmentText: string;
  startSec: number;
  endSec: number;
}) {
  const duration = Math.max(0.3, input.endSec - input.startSec);
  const fullText = `${input.title} ${input.hook} ${input.reason} ${input.segmentText}`.toLowerCase();
  const segmentWordCount = input.segmentText.trim().split(/\s+/).filter(Boolean).length;
  const wps = segmentWordCount / duration;
  const closure = /[.!?…]["')\]]*\s*$/u.test(input.segmentText.trim()) ? 1 : 0;
  const hasNumber = /\d/.test(fullText) ? 1 : 0;
  const hasQuestion = fullText.includes("?") ? 1 : 0;
  const hasConflict = /(erro|mistake|problema|problem|evite|avoid|não faça|don't)/.test(fullText) ? 1 : 0;
  const hasOutcome = /(resultado|result|antes|before|depois|after|ganho|improve|melhor)/.test(fullText) ? 1 : 0;
  const hasAction = /(como|how|passo|step|dica|tip|faça|do this)/.test(fullText) ? 1 : 0;

  const hook = clamp01((hasQuestion * 0.3) + (hasConflict * 0.35) + (hasNumber * 0.2) + (hasAction * 0.15));
  const value = clamp01((hasOutcome * 0.45) + (hasAction * 0.4) + (hasNumber * 0.15));
  const pacing = scoreWordsPerSecond(wps);
  const retentionDuration = clamp01(1 - Math.abs(duration - TARGET_SEGMENT_SEC) / Math.max(8, TARGET_SEGMENT_SEC));
  const retention = clamp01((retentionDuration * 0.65) + (closure * 0.35));
  const clarityLength = clamp01(1 - Math.max(0, Math.abs(input.segmentText.length - 160) / 200));
  const clarity = clamp01((clarityLength * 0.7) + (closure * 0.3));

  const score =
    (hook * 28) +
    (value * 24) +
    (pacing * 16) +
    (retention * 22) +
    (clarity * 10);
  const roundedScore = round1(Math.max(0, Math.min(100, score)));
  const band = roundedScore >= 75 ? "HIGH" : roundedScore >= 55 ? "MEDIUM" : "LOW";

  const reasons: string[] = [];
  if (hasConflict) reasons.push("Conflict/problem framing tends to hold attention.");
  if (hasOutcome) reasons.push("Clear outcome language improves completion rate.");
  if (hasNumber) reasons.push("Specific numbers make the promise concrete.");
  if (closure) reasons.push("Natural sentence ending reduces abrupt drop-off.");
  if (reasons.length === 0) reasons.push("Balanced structure with practical information.");

  return {
    score: roundedScore,
    band,
    reasons: reasons.slice(0, 3),
    breakdown: {
      hook: round1(hook * 100),
      value: round1(value * 100),
      pacing: round1(pacing * 100),
      retention: round1(retention * 100),
      clarity: round1(clarity * 100)
    }
  } satisfies ViralityScore;
}

type CompactSegment = {
  index: number;
  start_s: number;
  end_s: number;
  text: string;
};

function stripFillerWords(text: string) {
  const normalized = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => !FILLER_WORDS.has(token.toLowerCase()))
    .join(" ");
  return normalized;
}

function meaningfulCharCount(text: string) {
  return text.replace(/[^a-zA-Z0-9À-ÿ]/g, "").length;
}

function preprocessSegmentsForLlm(transcriptSegments: TranscriptSegment[]) {
  const cleaned = transcriptSegments
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      text: stripFillerWords(segment.text || "")
    }))
    .filter((segment) => segment.end - segment.start >= 2)
    .filter((segment) => meaningfulCharCount(segment.text) >= 15);

  const merged: Array<{ start: number; end: number; text: string }> = [];
  for (const segment of cleaned) {
    const previous = merged[merged.length - 1];
    const isMicro = segment.end - segment.start < 2.6;
    const nearPrevious = previous && segment.start - previous.end <= 0.6;
    if (previous && isMicro && nearPrevious) {
      previous.end = Math.max(previous.end, segment.end);
      previous.text = `${previous.text} ${segment.text}`.trim();
      continue;
    }
    merged.push({ ...segment });
  }

  return merged;
}

function buildCompactTranscriptInput(transcriptSegments: TranscriptSegment[], candidateWindows?: Array<{ start: number; end: number }>) {
  const prefiltered = preprocessSegmentsForLlm(transcriptSegments);
  const scoped = candidateWindows?.length
    ? prefiltered.filter((segment) => candidateWindows.some((window) => segment.end > window.start && segment.start < window.end))
    : prefiltered;
  const compactSegments: CompactSegment[] = scoped.slice(0, 220).map((segment, index) => ({
    index: index + 1,
    start_s: Number(segment.start.toFixed(3)),
    end_s: Number(segment.end.toFixed(3)),
    text: segment.text.slice(0, 300)
  }));

  const compactTranscript = JSON.stringify(compactSegments);
  return { compactSegments, compactTranscript };
}

type CandidateWindow = {
  start: number;
  end: number;
  score: number;
  snippet: string;
};

function preferredWindowLengths(text: string, bounds: SegmentDurationBounds, style: ClipStyleKey) {
  const lower = text.toLowerCase();
  const hasQuestion = /[?]/.test(text);
  const hasStepPattern = /\b(step|first|second|passo|primeiro|segundo|exemplo)\b/i.test(lower);
  const hasStoryPattern = /\b(when i|once|i remember|quando eu|um dia|lembro)\b/i.test(lower);

  let base = bounds.targetSec;
  if (style === "hooky" || hasQuestion) base -= 6;
  if (style === "educational" || hasStepPattern) base += 6;
  if (style === "story" || hasStoryPattern) base += 10;
  base = clamp(base, bounds.minSec, bounds.maxSec);

  const spread = clamp(Math.round((bounds.maxSec - bounds.minSec) * 0.24), 6, 22);
  const short = clamp(base - spread, bounds.minSec, bounds.maxSec);
  const medium = clamp(base, bounds.minSec, bounds.maxSec);
  const long = clamp(base + spread, bounds.minSec, bounds.maxSec);

  const unique = Array.from(new Set([short, medium, long].map((value) => Number(value.toFixed(1)))));
  unique.sort((a, b) => a - b);
  return unique;
}

function buildCandidateWindows(params: {
  transcriptSegments: TranscriptSegment[];
  durationSec: number;
  rangeStart: number;
  rangeEnd: number;
  config: EffectiveSelectionConfig;
}) {
  const maxClips = effectiveMaxClips(params.durationSec);
  const safeDuration =
    Number.isFinite(params.durationSec) && params.durationSec > 0
      ? Math.max(params.durationSec, params.config.bounds.minSec)
      : params.config.bounds.maxSec;
  const searchStart = Math.max(0, params.rangeStart);
  const searchEnd = Math.min(safeDuration, params.rangeEnd || safeDuration);
  const rankedAnchors = params.transcriptSegments
    .map((segment) => {
      const score = scoreSegment(segment, {
        style: params.config.style,
        genre: params.config.genre,
        bounds: params.config.bounds,
        includeMomentText: params.config.includeMomentText
      });
      return { ...segment, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  const windows: CandidateWindow[] = [];
  const makeWindow = (center: number, lengthSec: number, anchorScore: number, snippet: string) => {
    const maxStart = Math.max(searchStart, searchEnd - params.config.bounds.minSec);
    const start = clamp(center - lengthSec / 2, searchStart, maxStart);
    const end = clamp(start + lengthSec, start + params.config.bounds.minSec, searchEnd);
    if (end <= start) return;
    windows.push({
      start,
      end,
      score: anchorScore + Math.min(6, (end - start) / 10),
      snippet: snippet.slice(0, 180)
    });
  };

  for (const anchor of rankedAnchors) {
    const center = (anchor.start + anchor.end) / 2;
    const lengths = preferredWindowLengths(anchor.text, params.config.bounds, params.config.style);
    lengths.forEach((lengthSec, idx) => {
      const offset = idx === 0 ? -0.6 : idx === 2 ? 0.8 : 0;
      const scoreFactor = idx === 1 ? 1 : 0.97;
      makeWindow(center + offset, lengthSec, anchor.score * scoreFactor, anchor.text);
    });
    if (params.config.style === "story") {
      makeWindow(center + 1.5, Math.min(params.config.bounds.maxSec, params.config.bounds.targetSec + 18), anchor.score * 0.97, anchor.text);
    }
    if (params.config.style === "hooky") {
      makeWindow(center - 0.8, Math.max(params.config.bounds.minSec, params.config.bounds.targetSec - 10), anchor.score * 0.98, anchor.text);
    }
  }

  windows.sort((a, b) => b.score - a.score);
  const selected: CandidateWindow[] = [];
  for (const candidate of windows) {
    const overlaps = selected.some((picked) => overlapRatio(candidate.start, candidate.end, picked.start, picked.end) > 0.5);
    if (overlaps) continue;
    selected.push(candidate);
    const targetWindowCount = Math.max(maxClips * 3, 12);
    if (selected.length >= targetWindowCount) break;
  }
  return selected;
}

function buildCandidateSummary(candidates: CandidateWindow[]) {
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
  transcriptText: string,
  bounds: SegmentDurationBounds
) {
  const maxClips = effectiveMaxClips(durationSec);
  const safeDuration =
    Number.isFinite(durationSec) && durationSec > 0 ? Math.max(bounds.minSec, durationSec) : bounds.maxSec;

  if (!transcriptSegments.length) {
    const end = Math.min(safeDuration, Math.max(bounds.minSec, Math.min(bounds.targetSec, safeDuration)));
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
    const targetLen = bounds.targetSec;
    const maxStart = Math.max(0, safeDuration - bounds.minSec);
    let start = clamp(center - targetLen / 2, 0, maxStart);
    let end = Math.min(safeDuration, start + targetLen);

    if (end - start < bounds.minSec) {
      end = Math.min(safeDuration, start + bounds.minSec);
      start = Math.max(0, end - bounds.minSec);
    }
    if (end - start > bounds.maxSec) {
      end = start + bounds.maxSec;
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

    if (picks.length >= maxClips) break;
  }

  if (!picks.length) {
    const fallbackEnd = Math.min(safeDuration, Math.max(bounds.minSec, Math.min(bounds.targetSec, safeDuration)));
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
  wordBoundaries: number[],
  bounds: SegmentDurationBounds
) {
  if (!transcriptSegments.length) return { start, end };

  const safeDuration = Math.max(bounds.minSec, durationSec || bounds.minSec);
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
    if (transcriptSegments[endIdx].end - transcriptSegments[startIdx].start >= bounds.maxSec) break;
  }

  while (endIdx < transcriptSegments.length - 1) {
    const current = transcriptSegments[endIdx];
    const next = transcriptSegments[endIdx + 1];
    const shortGap = next.start - current.end <= 1.3;
    if (!shortGap) break;
    if (endsSentence(current.text)) break;
    endIdx += 1;
    if (transcriptSegments[endIdx].end - transcriptSegments[startIdx].start >= bounds.maxSec) break;
  }

  let alignedStart = clamp(transcriptSegments[startIdx].start, 0, safeDuration);
  let alignedEnd = clamp(transcriptSegments[endIdx].end, alignedStart + 0.2, safeDuration);
  if (wordBoundaries.length) {
    alignedStart = nearestBoundaryBefore(alignedStart, wordBoundaries, 1.2);
    alignedEnd = nearestBoundaryAfter(alignedEnd, wordBoundaries, 1.8);
  }

  if (alignedEnd - alignedStart < bounds.minSec) {
    alignedEnd = Math.min(safeDuration, alignedStart + bounds.minSec);
    alignedStart = Math.max(0, alignedEnd - bounds.minSec);
  }
  if (alignedEnd - alignedStart > bounds.maxSec) {
    alignedEnd = alignedStart + bounds.maxSec;
  }

  return { start: alignedStart, end: alignedEnd };
}

function refineSegmentBoundaries(
  start: number,
  end: number,
  transcriptSegments: TranscriptSegment[],
  durationSec: number,
  wordBoundaries: number[],
  silencePoints: number[],
  bounds: SegmentDurationBounds
) {
  const safeDuration = Math.max(bounds.minSec, durationSec || bounds.minSec);
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

  if (refinedEnd - refinedStart < bounds.minSec) {
    refinedEnd = Math.min(safeDuration, refinedStart + bounds.minSec);
  }
  if (refinedEnd - refinedStart > bounds.maxSec) {
    refinedEnd = refinedStart + bounds.maxSec;
  }
  if (refinedEnd > safeDuration) {
    refinedEnd = safeDuration;
    refinedStart = Math.max(0, refinedEnd - bounds.minSec);
  }

  return alignToSentenceBoundaries(refinedStart, refinedEnd, transcriptSegments, safeDuration, wordBoundaries, bounds);
}

function sanitizeSegments(
  input: Array<Record<string, unknown>>,
  durationSec: number,
  transcriptText: string,
  transcriptSegments: TranscriptSegment[],
  transcriptWords: TranscriptWord[],
  silencePoints: number[],
  bounds: SegmentDurationBounds
) {
  const maxClips = effectiveMaxClips(durationSec);
  const candidates: Array<Record<string, unknown>> = input.length
    ? input
    : heuristicBestSegments(transcriptSegments, durationSec, transcriptText, bounds).map((segment) => ({ ...segment }));
  const safeDuration =
    Number.isFinite(durationSec) && durationSec > 0 ? Math.max(bounds.minSec, durationSec) : bounds.maxSec;
  const wordBoundaries = sentenceBoundaryPointsFromWords(transcriptWords);
  const normalized: ClipSegment[] = [];

  for (const candidate of candidates) {
    const startRaw = readNumber(candidate.start ?? candidate["start_sec"], 0);
    const endRaw = readNumber(candidate.end ?? candidate["end_sec"], startRaw + bounds.minSec);
    const requestedDuration = clamp(endRaw - startRaw, bounds.minSec, bounds.maxSec);

    const maxStart = Math.max(0, safeDuration - bounds.minSec);
    let start = clamp(startRaw, 0, maxStart);
    let end = clamp(endRaw, start + bounds.minSec, safeDuration);

    if (end - start > bounds.maxSec) {
      end = start + bounds.maxSec;
    }
    if (end - start < bounds.minSec) {
      end = Math.min(safeDuration, start + bounds.minSec);
      start = Math.max(0, end - bounds.minSec);
    }
    if (end <= start) continue;
    const refined = refineSegmentBoundaries(start, end, transcriptSegments, safeDuration, wordBoundaries, silencePoints, bounds);
    start = refined.start;
    end = refined.end;
    const maxDurationFromRequest = Math.min(bounds.maxSec, requestedDuration + 8);
    if (end - start > maxDurationFromRequest) {
      end = start + maxDurationFromRequest;
    }
    if (end - start < bounds.minSec) {
      end = Math.min(safeDuration, start + bounds.minSec);
    }
    if (end - start > bounds.maxSec) {
      end = start + bounds.maxSec;
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
      ),
      text_excerpt: String(candidate.text_excerpt || "").slice(0, 240) || undefined,
      score_total: Number.isFinite(Number(candidate.score_total)) ? Number(candidate.score_total) : undefined,
      score_grade:
        String(candidate.score_grade || "").toUpperCase() === "A" ||
        String(candidate.score_grade || "").toUpperCase() === "B" ||
        String(candidate.score_grade || "").toUpperCase() === "C" ||
        String(candidate.score_grade || "").toUpperCase() === "D"
          ? (String(candidate.score_grade || "").toUpperCase() as "A" | "B" | "C" | "D")
          : undefined,
      score_metrics:
        candidate.score_metrics && typeof candidate.score_metrics === "object"
          ? (candidate.score_metrics as Record<string, number>)
          : undefined
    });

    if (normalized.length >= maxClips) break;
  }
  const scored = normalized
    .filter((segment) => segment.end - segment.start >= bounds.minSec)
    .map((segment) => {
      const overlapText = transcriptSegments
        .filter((s) => s.end > segment.start && s.start < segment.end)
        .map((s) => s.text)
        .join(" ");
      const virality = computeViralityScore({
        title: segment.title,
        hook: segment.hook,
        reason: segment.reason,
        segmentText: overlapText,
        startSec: segment.start,
        endSec: segment.end
      });
      const fallbackScore = engagementScore(`${segment.title} ${segment.hook} ${overlapText}`);
      const base = virality.score + fallbackScore * 0.6;
      return { ...segment, _score: base };
    })
    .sort((a, b) => b._score - a._score);

  const finalPicks: ClipSegment[] = [];
  const pool = [...scored];
  while (finalPicks.length < maxClips && pool.length) {
    let bestIndex = -1;
    let bestAdjustedScore = -Infinity;

    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      const overlaps = finalPicks.some((pick) => overlapRatio(pick.start, pick.end, candidate.start, candidate.end) > 0.45);
      if (overlaps) continue;

      const duration = candidate.end - candidate.start;
      let diversityPenalty = 0;
      for (const pick of finalPicks) {
        const pickDuration = pick.end - pick.start;
        const diff = Math.abs(duration - pickDuration);
        if (diff < 4) diversityPenalty += 7;
        else if (diff < 8) diversityPenalty += 3;
      }
      const adjusted = candidate._score - diversityPenalty;
      if (adjusted > bestAdjustedScore) {
        bestAdjustedScore = adjusted;
        bestIndex = i;
      }
    }

    if (bestIndex < 0) break;
    const chosen = pool.splice(bestIndex, 1)[0];
    finalPicks.push({
      clip_id: `clip_${finalPicks.length + 1}`,
      start: chosen.start,
      end: chosen.end,
      title: chosen.title,
      hook: chosen.hook,
      reason: chosen.reason,
      text_excerpt: chosen.text_excerpt,
      score_total: chosen.score_total,
      score_grade: chosen.score_grade,
      score_metrics: chosen.score_metrics
    });
  }
  return finalPicks;
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

function cacheBoundsSignature(params: {
  maxClips: number;
  bounds: SegmentDurationBounds;
  style: ClipStyleKey;
  genre: GenreKey;
  timeframeStartS: number | null;
  timeframeEndS: number | null;
  includeMomentText: string;
}) {
  const momentHash = createHash("sha1").update(params.includeMomentText || "").digest("hex").slice(0, 10);
  return `min=${params.bounds.minSec};target=${params.bounds.targetSec};max=${params.bounds.maxSec};count=${params.maxClips};style=${params.style};genre=${params.genre};time=${params.timeframeStartS ?? "auto"}-${params.timeframeEndS ?? "auto"};moment=${momentHash}`;
}

async function readSegmentSuggestionCache(params: {
  supabase: SupabaseClient;
  transcriptHash: string;
  provider: string;
  boundsSignature: string;
}) {
  const { data, error } = await params.supabase
    .from("segment_suggestions_cache")
    .select("suggestions_json")
    .eq("transcript_hash", params.transcriptHash)
    .eq("provider", params.provider)
    .eq("bounds_signature", params.boundsSignature)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;

  const suggestions = data[0]?.suggestions_json;
  if (!Array.isArray(suggestions)) return null;
  return suggestions.filter((entry) => typeof entry === "object" && entry !== null) as Array<Record<string, unknown>>;
}

async function writeSegmentSuggestionCache(params: {
  supabase: SupabaseClient;
  transcriptHash: string;
  provider: string;
  boundsSignature: string;
  suggestions: Array<Record<string, unknown>>;
}) {
  await params.supabase.from("segment_suggestions_cache").insert({
    transcript_hash: params.transcriptHash,
    provider: params.provider,
    bounds_signature: params.boundsSignature,
    suggestions_json: params.suggestions
  });
}

function buildSelectionConfig(effective: EffectiveSelectionConfig, durationSec: number): SelectionConfig {
  const clipCap = effectiveMaxClips(durationSec);
  const requested = effective.clipCount === null ? clipCap : Math.min(clipCap, effective.clipCount);
  return {
    ...DEFAULT_SELECTION_CONFIG,
    clip_style: effective.style,
    genre: effective.genre,
    max_clips: Math.max(1, requested),
    duration_min_s: effective.bounds.minSec,
    duration_max_s: effective.bounds.maxSec,
    include_moment_text: effective.includeMomentText,
    timeframe_start_s: effective.timeframeStartS,
    timeframe_end_s: effective.timeframeEndS
  };
}

function approxTokensFromChars(chars: number) {
  return Math.max(1, Math.round(chars / 4));
}

async function writeSelectionDebugArtifact(jobId: string | undefined, name: string, payload: unknown) {
  if (!jobId || process.env.SELECTION_DEBUG !== "1") return;
  const outDir = path.join(process.cwd(), "dev", "selection-debug", jobId);
  await fs.mkdir(outDir, { recursive: true });
  const fullPath = path.join(outDir, name);
  await fs.writeFile(fullPath, JSON.stringify(payload, null, 2), "utf8");
}

function deterministicMetadataFromCandidate(candidate: {
  id: string;
  start_s: number;
  end_s: number;
  text_excerpt: string;
  score_total: number;
  grade: "A" | "B" | "C" | "D";
  score_metrics: Record<string, number>;
}) {
  const firstSentence = candidate.text_excerpt.split(/[.!?]/)[0]?.trim() || candidate.text_excerpt.slice(0, 110);
  const title = normalizePortugueseTitle(firstSentence, Number(candidate.id.replace(/\D/g, "")) || 1);
  const hook = normalizePortugueseSentence(firstSentence.slice(0, 140), "Trecho relevante para alto engajamento");
  const reason = normalizePortugueseSentence(
    `Pontuação ${candidate.score_total.toFixed(1)} (${candidate.grade}) com foco em gancho e clareza.`,
    "Seleção por pontuação determinística."
  );
  return { start: candidate.start_s, end: candidate.end_s, title, hook, reason, score_total: candidate.score_total, score_grade: candidate.grade, score_metrics: candidate.score_metrics, text_excerpt: candidate.text_excerpt };
}

async function refineWithLlmShortlist(params: {
  shortlist: Array<{
    id: string;
    start_s: number;
    end_s: number;
    text_excerpt: string;
    score_total: number;
    grade: "A" | "B" | "C" | "D";
    score_metrics: Record<string, number>;
  }>;
  selectionConfig: SelectionConfig;
  maxClips: number;
  durationSec: number;
}) {
  const llmEnabled = (process.env.SELECTION_LLM_REFINEMENT || "1") !== "0";
  if (!llmEnabled || !params.shortlist.length) return null;

  const compact = params.shortlist.map((item) => ({
    id: item.id,
    start: Number(item.start_s.toFixed(2)),
    end: Number(item.end_s.toFixed(2)),
    text: item.text_excerpt.slice(0, 220)
  }));
  const promptJson = JSON.stringify(compact);
  const maxChars = params.selectionConfig.token_budget;
  const payload = promptJson.length > maxChars ? promptJson.slice(0, maxChars) : promptJson;

  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0.1 },
      messages: [
        {
          role: "system",
          content:
            `Return ONLY JSON: {"segments":[{"id":"c1","start":number,"end":number,"title":string,"hook":string,"reason":string}]}. Pick up to ${params.maxClips}. Keep start/end within original candidate ±3s.`
        },
        {
          role: "user",
          content:
            `Video duration: ${params.durationSec}s. Style=${params.selectionConfig.clip_style}. Genre=${params.selectionConfig.genre}. Candidates=${payload}`
        }
      ]
    })
  });
  if (!response.ok) return null;
  const rawBody = await response.text();
  if (looksLikeHtml(rawBody)) return null;
  let parsedBody: { message?: { content?: string }; response?: string };
  try {
    parsedBody = JSON.parse(rawBody) as { message?: { content?: string }; response?: string };
  } catch {
    return null;
  }
  const content = parsedBody.message?.content || parsedBody.response || '{"segments":[]}';
  const parsed = parseJsonObject(content);
  const rows = Array.isArray(parsed.segments) ? parsed.segments : [];
  return rows.filter((row) => typeof row === "object" && row !== null) as Array<Record<string, unknown>>;
}

async function selectSegments(
  supabase: SupabaseClient,
  transcriptText: string,
  durationSec: number,
  transcriptSegments: TranscriptSegment[],
  transcriptWords: TranscriptWord[],
  silencePoints: number[],
  selectionConfigInput: SegmentSelectionConfig,
  options?: { jobId?: string; onStage?: SelectionStageCallback }
) {
  const provider = getSegmentProvider();
  const effectiveConfig = parseSelectionConfig(selectionConfigInput);
  const selectionConfig = buildSelectionConfig(effectiveConfig, durationSec);
  const maxClips = selectionConfig.max_clips;
  const scoped = scopeTranscriptToTimeframe(
    transcriptSegments,
    transcriptWords,
    transcriptText,
    durationSec,
    silencePoints,
    effectiveConfig
  );
  await options?.onStage?.("Normalizing transcript…", 52);
  const normalizedBlocks = normalizeTranscript(
    scoped.scopedSegments.map((segment) => ({ start: segment.start, end: segment.end, text: segment.text })),
    { minBlockSec: selectionConfig.block_min_s, maxBlockSec: selectionConfig.block_max_s }
  );
  await writeSelectionDebugArtifact(options?.jobId, "normalized_blocks.json", normalizedBlocks);

  await options?.onStage?.("Generating candidates…", 56);
  const generatedCandidates = generateCandidates(normalizedBlocks, selectionConfig);
  await writeSelectionDebugArtifact(options?.jobId, "candidates.json", generatedCandidates);

  await options?.onStage?.("Ranking & selecting clips…", 60);
  const ranked = rankCandidates(generatedCandidates, selectionConfig);
  const shortlist = selectWithDiversity(
    ranked.slice(0, Math.min(12, Math.max(maxClips * 2, 8))),
    { ...selectionConfig, max_clips: Math.min(12, Math.max(maxClips * 2, 8)) }
  );
  await writeSelectionDebugArtifact(options?.jobId, "shortlist.json", shortlist);

  const candidateWindows = shortlist.map((candidate) => ({
    start: candidate.start_s,
    end: candidate.end_s,
    score: candidate.score_total,
    snippet: candidate.text_excerpt
  }));
  const { compactTranscript } = buildCompactTranscriptInput(scoped.scopedSegments, candidateWindows);
  const candidateSummary = buildCandidateSummary(candidateWindows);
  const transcriptHash = createHash("sha256").update(scoped.scopedText).digest("hex");
  const boundsSignature = cacheBoundsSignature({
    maxClips,
    bounds: effectiveConfig.bounds,
    style: effectiveConfig.style,
    genre: effectiveConfig.genre,
    timeframeStartS: effectiveConfig.timeframeStartS,
    timeframeEndS: effectiveConfig.timeframeEndS,
    includeMomentText: effectiveConfig.includeMomentText
  });

  const cachedRaw = await readSegmentSuggestionCache({
    supabase,
    transcriptHash,
    provider,
    boundsSignature
  });
  if (cachedRaw?.length) {
    const cachedSanitized = sanitizeSegments(
      looksLikeEvenSplit(cachedRaw) ? [] : cachedRaw,
      durationSec,
      scoped.scopedText,
      scoped.scopedSegments,
      scoped.scopedWords,
      scoped.scopedSilencePoints,
      effectiveConfig.bounds
    );
    if (cachedSanitized.length) {
      await writeSelectionDebugArtifact(options?.jobId, "final_selection.json", cachedSanitized);
      return cachedSanitized.slice(0, maxClips);
    }
  }

  const shortlistForLlm = shortlist.map((candidate) => ({
    id: candidate.id,
    start_s: candidate.start_s,
    end_s: candidate.end_s,
    text_excerpt: candidate.text_excerpt.slice(0, 260),
    score_total: candidate.score_total,
    grade: candidate.grade,
    score_metrics: candidate.metrics
  }));

  const llmInputChars = JSON.stringify(shortlistForLlm).length + compactTranscript.length + candidateSummary.length;
  await writeSelectionDebugArtifact(options?.jobId, "selection_stats.json", {
    blocks: normalizedBlocks.length,
    candidates: generatedCandidates.length,
    shortlisted: shortlistForLlm.length,
    avg_candidate_length_s:
      generatedCandidates.length > 0
        ? Number(
            (
              generatedCandidates.reduce((sum, item) => sum + (item.end_s - item.start_s), 0) /
              generatedCandidates.length
            ).toFixed(2)
          )
        : 0,
    llm_prompt_chars_estimate: llmInputChars,
    llm_prompt_tokens_estimate: approxTokensFromChars(llmInputChars)
  });

  await options?.onStage?.("Generating metadata…", 64);
  const llmRows = await refineWithLlmShortlist({
    shortlist: shortlistForLlm,
    selectionConfig,
    maxClips,
    durationSec
  }).catch(() => null);

  let raw: Array<Record<string, unknown>> = [];
  if (llmRows?.length) {
    const byId = new Map(shortlistForLlm.map((item) => [item.id, item]));
    raw = llmRows
      .map((row) => {
        const id = String(row.id || "");
        const fromShortlist = byId.get(id);
        if (!fromShortlist) return null;
        const startCandidate = Number(row.start);
        const endCandidate = Number(row.end);
        const start = Number.isFinite(startCandidate)
          ? clamp(startCandidate, fromShortlist.start_s - 3, fromShortlist.start_s + 3)
          : fromShortlist.start_s;
        const end = Number.isFinite(endCandidate)
          ? clamp(endCandidate, fromShortlist.end_s - 3, fromShortlist.end_s + 3)
          : fromShortlist.end_s;
        return {
          start,
          end,
          title: String(row.title || ""),
          hook: String(row.hook || ""),
          reason: String(row.reason || ""),
          score_total: fromShortlist.score_total,
          score_grade: fromShortlist.grade,
          score_metrics: fromShortlist.score_metrics,
          text_excerpt: fromShortlist.text_excerpt
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((row) => row as Record<string, unknown>);
  } else {
    raw = shortlistForLlm.map((candidate) => deterministicMetadataFromCandidate(candidate) as Record<string, unknown>);
  }

  await writeSegmentSuggestionCache({ supabase, transcriptHash, provider, boundsSignature, suggestions: raw }).catch(() => undefined);
  const sanitized = sanitizeSegments(
    looksLikeEvenSplit(raw) ? [] : raw,
    durationSec,
    scoped.scopedText,
    scoped.scopedSegments,
    scoped.scopedWords,
    scoped.scopedSilencePoints,
    effectiveConfig.bounds
  );
  const finalSelection = (sanitized.length
    ? sanitized
    : sanitizeSegments(
        [],
        durationSec,
        scoped.scopedText,
        scoped.scopedSegments,
        scoped.scopedWords,
        scoped.scopedSilencePoints,
        effectiveConfig.bounds
      )).slice(0, maxClips);
  await writeSelectionDebugArtifact(options?.jobId, "final_selection.json", finalSelection);
  return finalSelection;
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
      text: wrapCaptionText(escapeAssText(segment.text), 34)
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

    if (isLocalSourcePath(job.sourcePath)) {
      const localPath = toLocalFilePath(job.sourcePath);
      if (!localPath) throw new Error("Invalid local source path.");
      await updateJobProgress(job.id, "DOWNLOADING_SOURCE", 8, "Loading source video from local disk.");
      const bytes = await fs.readFile(localPath).catch(() => null);
      if (!bytes) throw new Error("Source video not found in local upload path.");
      await fs.writeFile(sourcePath, bytes);
    } else {
      await updateJobProgress(job.id, "DOWNLOADING_SOURCE", 8, "Downloading source video from Supabase.");
      const { data: sourceData, error: sourceError } = await supabase.storage.from("uploads").download(job.sourcePath);
      if (sourceError || !sourceData) {
        throw new Error(sourceError?.message || "Source video not found in uploads bucket.");
      }
      await fs.writeFile(sourcePath, Buffer.from(await sourceData.arrayBuffer()));
    }

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

    await updateJobProgress(job.id, "SELECTING_CLIPS", 50, "Normalizing transcript…");
    const selectedSegments = await selectSegments(
      supabase,
      transcription.text,
      transcription.durationSec,
      transcription.segments,
      transcription.words,
      silencePoints,
      {
        clipStyle: job.clipStyle,
        genre: job.genre,
        clipCount: job.desiredClipCount,
        clipLengthMaxS: job.clipLengthMaxS,
        includeMomentText: job.includeMomentText,
        timeframeStartS: job.timeframeStartS,
        timeframeEndS: job.timeframeEndS
      },
      {
        jobId: job.id,
        onStage: async (stage, progress) => {
          await updateJobProgress(job.id, "SELECTING_CLIPS", progress, stage);
        }
      }
    );
    if (!selectedSegments.length) {
      throw new Error("No valid segments were produced after validation.");
    }
    const translatedCaptions = await translateCaptionSegments(
      transcription.segments,
      selectedSegments,
      cropConfig.captionLanguage
    );
    const captionSegments = translatedCaptions.segments;

    const exportsRows: FinalizeExport[] = [];
    const subtitlesBurned = true;
    await updateJobProgress(job.id, "SELECTING_CLIPS", 66, "Generating metadata…");
    for (let index = 0; index < selectedSegments.length; index += 1) {
      const segment = selectedSegments[index];
      const clipNumber = index + 1;
      const progress = Math.min(92, 55 + Math.round((clipNumber / selectedSegments.length) * 35));
      await updateJobProgress(job.id, "RENDERING_EXPORTS", progress, `Rendering clip ${clipNumber}/${selectedSegments.length}.`);

      const srtPath = path.join(tmpDir, `${segment.clip_id}.srt`);
      const assPath = path.join(tmpDir, `${segment.clip_id}.ass`);
      const mp4Path = path.join(tmpDir, `${segment.clip_id}.mp4`);
      await writeSrtForClip(srtPath, captionSegments, segment.start, segment.end);
      await writeAssForClip(assPath, captionSegments, segment.start, segment.end, cropConfig.captionPreset, targetSize.height);

      const filterWithSubtitles = `[0:v]setpts=PTS-STARTPTS,scale=${targetSize.width}:${targetSize.height}:force_original_aspect_ratio=increase,crop=${targetSize.width}:${targetSize.height},boxblur=18:2[bg];` +
        `[0:v]setpts=PTS-STARTPTS,scale=${targetSize.width}:${targetSize.height}:force_original_aspect_ratio=decrease[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,ass='${escapeForFilterPath(assPath)}'[vout]`;
      const clipDuration = Math.max(0.3, segment.end - segment.start);

      const renderArgs = (filter: string) => [
        "-y",
        "-ss",
        String(segment.start),
        "-t",
        String(clipDuration),
        "-i",
        sourcePath,
        "-filter_complex",
        filter,
        "-map",
        "[vout]",
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

      const segmentText = transcription.segments
        .filter((s) => s.end > segment.start && s.start < segment.end)
        .map((s) => s.text)
        .join(" ");
      const virality = computeViralityScore({
        title: segment.title,
        hook: segment.hook,
        reason: segment.reason,
        segmentText,
        startSec: segment.start,
        endSec: segment.end
      });
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
          ai_start_sec: segment.start,
          ai_end_sec: segment.end,
          virality_score: virality.score,
          virality_band: virality.band,
          virality_reasons: virality.reasons,
          virality_breakdown: virality.breakdown,
          start_sec: segment.start,
          end_sec: segment.end,
          duration_sec: clipDuration,
          selection_score_total: segment.score_total ?? null,
          selection_score_grade: segment.score_grade ?? null,
          selection_score_metrics: segment.score_metrics ?? null,
          selection_text_excerpt: segment.text_excerpt ?? null,
          subtitles_path: srtObjectPath,
          subtitles_ass_path: assObjectPath,
          subtitles_burned: subtitlesBurned,
          subtitles_animated: true,
          silence_points_count: silencePoints.length,
          transcript_word_count: transcription.words.length,
          caption_preset: cropConfig.captionPreset,
          caption_language: cropConfig.captionLanguage,
          caption_source_language: TRANSCRIBE_LANGUAGE,
          caption_translated: translatedCaptions.translated,
          ...(translatedCaptions.translated
            ? {
                caption_translation_provider: translatedCaptions.provider,
                caption_translation_model: translatedCaptions.model
              }
            : {}),
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
