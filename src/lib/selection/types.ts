export type ClipStyleKey = "hooky" | "balanced" | "educational" | "story";
export type GenreKey = "tutorial" | "podcast" | "demo" | "interview" | "talking_head" | "other";

export type SegmentDurationBounds = {
  minSec: number;
  targetSec: number;
  maxSec: number;
};

export type SelectionConfig = {
  clip_style: ClipStyleKey;
  genre: GenreKey;
  max_clips: number;
  duration_min_s: number;
  duration_max_s: number;
  overlap_threshold: number;
  min_distance_s: number;
  include_moment_text: string;
  timeframe_start_s: number | null;
  timeframe_end_s: number | null;
  token_budget: number;
  max_candidates: number;
  block_min_s: number;
  block_max_s: number;
};

export type TranscriptSegmentInput = {
  start: number;
  end: number;
  text: string;
};

export type NormalizedBlock = {
  id: string;
  start_s: number;
  end_s: number;
  text: string;
  scoring_text: string;
  word_count: number;
  char_count: number;
  starts_at_sentence_boundary: boolean;
  ends_at_sentence_boundary: boolean;
};

export type CandidateWindow = {
  id: string;
  start_s: number;
  end_s: number;
  text_excerpt: string;
  source_block_ids: string[];
  features_summary: Record<string, number | boolean>;
  word_count: number;
};

export type CandidateScore = {
  score_total: number;
  grade: "A" | "B" | "C" | "D";
  metrics: {
    hook: number;
    clarity: number;
    density: number;
    informativeness: number;
    red_flags: number;
    include_moment: number;
  };
};

export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  clip_style: "balanced",
  genre: "tutorial",
  max_clips: 8,
  duration_min_s: 30,
  duration_max_s: 60,
  overlap_threshold: 0.15,
  min_distance_s: 20,
  include_moment_text: "",
  timeframe_start_s: null,
  timeframe_end_s: null,
  token_budget: 9000,
  max_candidates: 40,
  block_min_s: 3,
  block_max_s: 8
};
