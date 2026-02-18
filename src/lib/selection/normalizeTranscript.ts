import { stripFillerWords } from "@/lib/selection/features";
import type { NormalizedBlock, TranscriptSegmentInput } from "@/lib/selection/types";

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function startsSentence(text: string) {
  return /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]/u.test(text.trim());
}

function endsSentence(text: string) {
  return /[.!?…]["')\]]*\s*$/u.test(text.trim());
}

export function normalizeTranscript(
  segments: TranscriptSegmentInput[],
  options?: { minBlockSec?: number; maxBlockSec?: number; maxGapSec?: number }
) {
  const minBlockSec = options?.minBlockSec ?? 3;
  const maxBlockSec = options?.maxBlockSec ?? 8;
  const maxGapSec = options?.maxGapSec ?? 1.2;

  const sorted = [...segments]
    .map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      text: normalizeWhitespace(String(segment.text || ""))
    }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start && segment.text)
    .sort((a, b) => a.start - b.start);

  const blocks: NormalizedBlock[] = [];
  let current: { start: number; end: number; texts: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const text = normalizeWhitespace(current.texts.join(" "));
    if (!text) {
      current = null;
      return;
    }
    const words = text.split(/\s+/).filter(Boolean);
    blocks.push({
      id: `b${blocks.length + 1}`,
      start_s: Number(current.start.toFixed(3)),
      end_s: Number(current.end.toFixed(3)),
      text,
      scoring_text: stripFillerWords(text),
      word_count: words.length,
      char_count: text.length,
      starts_at_sentence_boundary: startsSentence(text),
      ends_at_sentence_boundary: endsSentence(text)
    });
    current = null;
  };

  for (const segment of sorted) {
    if (!current) {
      current = { start: segment.start, end: segment.end, texts: [segment.text] };
      continue;
    }

    const blockDuration = current.end - current.start;
    const gap = segment.start - current.end;
    const canMerge =
      gap <= maxGapSec &&
      (blockDuration < minBlockSec || (blockDuration < maxBlockSec && !endsSentence(current.texts[current.texts.length - 1])));

    if (canMerge) {
      current.end = Math.max(current.end, segment.end);
      current.texts.push(segment.text);
      continue;
    }
    flush();
    current = { start: segment.start, end: segment.end, texts: [segment.text] };
  }

  flush();
  return blocks;
}
