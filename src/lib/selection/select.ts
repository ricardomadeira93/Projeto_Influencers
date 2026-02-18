import { scoreCandidate } from "@/lib/selection/score";
import type { CandidateScore, CandidateWindow, SelectionConfig } from "@/lib/selection/types";

export type ScoredCandidate = CandidateWindow & CandidateScore;

function overlapRatio(a: CandidateWindow, b: CandidateWindow) {
  const overlap = Math.max(0, Math.min(a.end_s, b.end_s) - Math.max(a.start_s, b.start_s));
  if (!overlap) return 0;
  return overlap / Math.min(a.end_s - a.start_s, b.end_s - b.start_s);
}

export function rankCandidates(candidates: CandidateWindow[], config: SelectionConfig) {
  return candidates
    .map((candidate) => ({ ...candidate, ...scoreCandidate(candidate, config) }))
    .sort((a, b) => b.score_total - a.score_total);
}

export function selectWithDiversity(rankedCandidates: ScoredCandidate[], config: SelectionConfig) {
  const picks: ScoredCandidate[] = [];
  for (const candidate of rankedCandidates) {
    const overlaps = picks.some((pick) => overlapRatio(candidate, pick) > config.overlap_threshold);
    if (overlaps) continue;
    const tooClose = picks.some((pick) => Math.abs(candidate.start_s - pick.start_s) < config.min_distance_s);
    if (tooClose) continue;
    picks.push(candidate);
    if (picks.length >= config.max_clips) break;
  }
  return picks;
}
