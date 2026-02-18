export type ClipStyleKey = "balanced" | "hooky" | "educational" | "story";
export type GenreKey = "tutorial" | "podcast" | "demo" | "interview" | "talking_head" | "other";

export type SegmentDurationBounds = {
  minSec: number;
  targetSec: number;
  maxSec: number;
};

export type ScoringSegmentInput = {
  start: number;
  end: number;
  text: string;
};

export type SegmentScoringContext = {
  style: ClipStyleKey;
  genre: GenreKey;
  bounds: SegmentDurationBounds;
  includeMomentText?: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function countRegex(text: string, pattern: RegExp) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function keywordOverlapScore(text: string, phrase?: string | null) {
  const source = (phrase || "").trim().toLowerCase();
  if (!source) return 0;
  const words = source
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
  if (!words.length) return 0;
  const lower = text.toLowerCase();
  const hits = words.filter((word) => lower.includes(word)).length;
  return hits / words.length;
}

export function normalizeClipStyle(raw?: string | null): ClipStyleKey {
  const key = String(raw || "balanced").trim().toLowerCase().replace(/\s+/g, "_");
  if (key === "hooky") return "hooky";
  if (key === "educational") return "educational";
  if (key === "story") return "story";
  if (key === "balanced") return "balanced";
  if (key === "hook") return "hooky";
  return "balanced";
}

export function normalizeGenre(raw?: string | null): GenreKey {
  const key = String(raw || "other").trim().toLowerCase().replace(/\s+/g, "_");
  if (key === "tutorial") return "tutorial";
  if (key === "podcast") return "podcast";
  if (key === "demo") return "demo";
  if (key === "interview") return "interview";
  if (key === "talking_head") return "talking_head";
  return "other";
}

export function resolveDurationBounds(style: ClipStyleKey, userMaxSec?: number | null): SegmentDurationBounds {
  const baseByStyle: Record<ClipStyleKey, SegmentDurationBounds> = {
    balanced: { minSec: 30, targetSec: 45, maxSec: 60 },
    hooky: { minSec: 20, targetSec: 30, maxSec: 45 },
    educational: { minSec: 45, targetSec: 60, maxSec: 90 },
    story: { minSec: 45, targetSec: 75, maxSec: 120 }
  };
  const base = baseByStyle[style];
  const userMax = Number(userMaxSec);
  const cappedMax = Number.isFinite(userMax) && userMax > 0 ? Math.min(base.maxSec, Math.round(userMax)) : base.maxSec;
  const minSec = Math.min(base.minSec, Math.max(12, cappedMax - 5));
  const targetSec = clamp(base.targetSec, minSec, cappedMax);
  return { minSec, targetSec, maxSec: cappedMax };
}

export function scoreSegment(segment: ScoringSegmentInput, ctx: SegmentScoringContext): number {
  const text = String(segment.text || "").trim();
  if (!text) return 0;
  const duration = Math.max(0.2, Number(segment.end) - Number(segment.start));
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const wordsPerSecond = words.length / duration;
  const punctuationCount = countRegex(text, /[.,!?;:]/g);
  const punctuationDensity = punctuationCount / Math.max(1, text.length / 120);
  const startsUpper = /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]/u.test(text);
  const endsClean = /[.!?…]["')\]]*\s*$/u.test(text);
  const startsWeak = /^(so|and|yeah|então|e aí|bom|bem)\b/i.test(text);

  const durationQuality =
    duration < ctx.bounds.minSec
      ? 0.35 + clamp(duration / ctx.bounds.minSec, 0, 1) * 0.45
      : duration > ctx.bounds.maxSec
        ? 0.35 + clamp(ctx.bounds.maxSec / duration, 0, 1) * 0.45
        : 1 - Math.min(1, Math.abs(duration - ctx.bounds.targetSec) / Math.max(8, ctx.bounds.targetSec));
  const speechDensity = 1 - Math.min(1, Math.abs(wordsPerSecond - 2.5) / 2.5);
  const punctuationScore = clamp(punctuationDensity / 5.5, 0, 1);
  const sentenceCompleteness = (startsUpper ? 0.5 : 0) + (endsClean ? 0.5 : 0);

  let score = durationQuality * 34 + speechDensity * 26 + punctuationScore * 16 + sentenceCompleteness * 24;

  if (ctx.style === "hooky") {
    if (/[?]/.test(text)) score += 7;
    if (/\b(don't|stop|mistake|wrong|you are|como|how to)\b/i.test(lower)) score += 8;
    if (/\b(3|5|7)\b/.test(lower)) score += 4;
    if (startsWeak) score -= 9;
    if (!startsUpper) score -= 4;
  } else if (ctx.style === "educational") {
    if (/\b(step|first|second|let me explain|for example|passo|primeiro|segundo|exemplo)\b/i.test(lower)) score += 10;
    if (/:/.test(text) || /\bporque\b|\btherefore\b|\bpor isso\b/i.test(lower)) score += 4;
  } else if (ctx.style === "story") {
    if (/\b(when i|i remember|once|quando eu|lembro|um dia)\b/i.test(lower)) score += 10;
    if (/\b(feel|felt|fear|surprise|happy|triste|medo|surpresa|emocion)\w*\b/i.test(lower)) score += 5;
    if (!endsClean) score -= 6;
  }

  if (ctx.genre === "tutorial") {
    if (/\b(click|open|go to|configure|run|instale|abra|clique|configure)\b/i.test(lower)) score += 4;
  } else if (ctx.genre === "podcast") {
    if (duration >= 40) score += 2;
  } else if (ctx.genre === "demo") {
    if (/\b(click|open|go to|feature|dashboard|botão|tela|aba)\b/i.test(lower)) score += 5;
  } else if (ctx.genre === "interview") {
    if (/[?]/.test(text) || /^(q:|a:|pergunta|resposta)\b/i.test(lower)) score += 4;
  }

  const momentOverlap = keywordOverlapScore(text, ctx.includeMomentText);
  if (momentOverlap > 0) {
    score *= 1 + Math.min(0.2, momentOverlap * 0.2);
  }

  return Number(clamp(score, 0, 100).toFixed(3));
}
