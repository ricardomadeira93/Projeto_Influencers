import { extractFeatures, keywordOverlapRatio } from "@/lib/selection/features";
import type { CandidateScore, CandidateWindow, SelectionConfig } from "@/lib/selection/types";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function wordsPerSecondScore(wordsPerSec: number) {
  return clamp01(1 - Math.abs(wordsPerSec - 2.3) / 2.3);
}

export function scoreCandidate(candidate: CandidateWindow, config: SelectionConfig): CandidateScore {
  const duration = Math.max(0.3, candidate.end_s - candidate.start_s);
  const features = extractFeatures(candidate.text_excerpt);
  const wordsPerSec = candidate.word_count / duration;
  const momentMatch = keywordOverlapRatio(candidate.text_excerpt, config.include_moment_text);
  const startsClean = features.starts_with_filler ? 0.3 : 1;
  const hook =
    (features.has_question ? 0.28 : 0) +
    (features.has_how_to ? 0.24 : 0) +
    (features.has_warning_words ? 0.24 : 0) +
    (startsClean * 0.24);
  const clarity = (features.unique_word_ratio * 0.6) + (features.has_numbered_list ? 0.2 : 0) + (features.has_step_words ? 0.2 : 0);
  const density = wordsPerSecondScore(wordsPerSec);
  const informativeness = clamp01((features.keyword_density * 1.6) + (features.has_step_words ? 0.2 : 0) + (features.has_story_markers ? 0.15 : 0));
  const redFlags = features.contains_cta_noise ? 1 : 0;

  let hookWeight = 0.28;
  let infoWeight = 0.24;
  let densityWeight = 0.16;
  let clarityWeight = 0.2;
  let momentWeight = 0.12;

  if (config.clip_style === "hooky") {
    hookWeight = 0.38;
    infoWeight = 0.18;
    clarityWeight = 0.16;
  } else if (config.clip_style === "educational") {
    hookWeight = 0.2;
    infoWeight = 0.34;
    clarityWeight = 0.22;
  } else if (config.clip_style === "story") {
    hookWeight = 0.24;
    infoWeight = 0.24;
    densityWeight = 0.12;
    clarityWeight = 0.26;
  }

  const genreMultiplier =
    config.genre === "demo" ? 1.04 :
    config.genre === "tutorial" ? 1.03 :
    config.genre === "podcast" ? 1.01 :
    config.genre === "interview" ? 1.02 :
    1;

  const raw =
    (hook * hookWeight) +
    (clarity * clarityWeight) +
    (density * densityWeight) +
    (informativeness * infoWeight) +
    (momentMatch * momentWeight) -
    (redFlags * 0.24);

  const total = Math.max(0, Math.min(100, raw * 100 * genreMultiplier));
  const grade: CandidateScore["grade"] = total >= 82 ? "A" : total >= 68 ? "B" : total >= 52 ? "C" : "D";

  return {
    score_total: Number(total.toFixed(3)),
    grade,
    metrics: {
      hook: Number((hook * 100).toFixed(2)),
      clarity: Number((clarity * 100).toFixed(2)),
      density: Number((density * 100).toFixed(2)),
      informativeness: Number((informativeness * 100).toFixed(2)),
      red_flags: Number((redFlags * 100).toFixed(2)),
      include_moment: Number((momentMatch * 100).toFixed(2))
    }
  };
}
