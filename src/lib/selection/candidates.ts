import { extractFeatures, keywordOverlapRatio } from "@/lib/selection/features";
import type { CandidateWindow, NormalizedBlock, SelectionConfig } from "@/lib/selection/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function overlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function styleDurations(config: SelectionConfig) {
  const min = config.duration_min_s;
  const max = config.duration_max_s;
  const target = Math.round((min + max) / 2);
  const short = clamp(target - 10, min, max);
  const medium = clamp(target, min, max);
  const long = clamp(target + 12, min, max);
  return Array.from(new Set([short, medium, long]));
}

function candidateText(blocks: NormalizedBlock[], start: number, end: number, charLimit: number) {
  const joined = blocks
    .filter((block) => overlap(start, end, block.start_s, block.end_s) > 0)
    .map((block) => block.scoring_text || block.text)
    .join(" ")
    .trim();
  return joined.slice(0, charLimit);
}

export function generateCandidates(blocks: NormalizedBlock[], config: SelectionConfig) {
  const scopedBlocks = blocks.filter((block) => {
    const startOk = config.timeframe_start_s === null || block.end_s > config.timeframe_start_s;
    const endOk = config.timeframe_end_s === null || block.start_s < config.timeframe_end_s;
    return startOk && endOk;
  });
  if (!scopedBlocks.length) return [] as CandidateWindow[];

  const durations = styleDurations(config);
  const scoredBlocks = scopedBlocks
    .map((block) => {
      const features = extractFeatures(block.scoring_text);
      const momentBoost = keywordOverlapRatio(block.scoring_text, config.include_moment_text);
      let score = 0;
      if (features.has_question) score += 6;
      if (features.has_how_to) score += 5;
      if (features.has_warning_words) score += 5;
      if (features.has_step_words) score += 4;
      if (features.has_story_markers) score += 4;
      if (features.starts_with_filler) score -= 4;
      if (features.contains_cta_noise) score -= 6;
      score += momentBoost * 12;
      return { block, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  const candidates: CandidateWindow[] = [];
  for (const entry of scoredBlocks) {
    for (const duration of durations) {
      const center = (entry.block.start_s + entry.block.end_s) / 2;
      const timeframeStart = config.timeframe_start_s ?? 0;
      const timeframeEnd = config.timeframe_end_s ?? Number.MAX_SAFE_INTEGER;
      const start = clamp(center - duration / 2, timeframeStart, timeframeEnd - config.duration_min_s);
      const end = clamp(start + duration, start + config.duration_min_s, timeframeEnd);
      if (end <= start) continue;
      const text = candidateText(scopedBlocks, start, end, 360);
      if (!text) continue;
      const features = extractFeatures(text);
      candidates.push({
        id: `c${candidates.length + 1}`,
        start_s: Number(start.toFixed(3)),
        end_s: Number(end.toFixed(3)),
        text_excerpt: text,
        source_block_ids: [entry.block.id],
        word_count: text.split(/\s+/).filter(Boolean).length,
        features_summary: {
          ...features,
          base_block_score: Number(entry.score.toFixed(3))
        }
      });
      if (candidates.length >= config.max_candidates) break;
    }
    if (candidates.length >= config.max_candidates) break;
  }

  candidates.sort((a, b) => a.start_s - b.start_s);
  const deduped: CandidateWindow[] = [];
  for (const candidate of candidates) {
    const duplicate = deduped.some((item) => overlap(item.start_s, item.end_s, candidate.start_s, candidate.end_s) / Math.min(item.end_s - item.start_s, candidate.end_s - candidate.start_s) > 0.8);
    if (!duplicate) deduped.push(candidate);
  }
  return deduped.slice(0, config.max_candidates);
}
