import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTranscript } from "@/lib/selection/normalizeTranscript";
import { generateCandidates } from "@/lib/selection/candidates";
import { rankCandidates } from "@/lib/selection/select";
import { DEFAULT_SELECTION_CONFIG, type SelectionConfig } from "@/lib/selection/types";

function baseConfig(overrides?: Partial<SelectionConfig>): SelectionConfig {
  return { ...DEFAULT_SELECTION_CONFIG, ...overrides };
}

test("normalizeTranscript merges micro segments into larger blocks", () => {
  const blocks = normalizeTranscript([
    { start: 0, end: 1.2, text: "So this" },
    { start: 1.25, end: 2.4, text: "is a quick intro." },
    { start: 2.5, end: 4.1, text: "Step one open settings." }
  ]);
  assert.equal(blocks.length, 1);
  assert.ok((blocks[0].end_s - blocks[0].start_s) >= 3);
  assert.equal(blocks[0].starts_at_sentence_boundary, false);
});

test("generateCandidates respects timeframe and duration bounds", () => {
  const blocks = normalizeTranscript([
    { start: 0, end: 4, text: "Welcome back everyone." },
    { start: 20, end: 26, text: "How to fix this mistake quickly?" },
    { start: 40, end: 47, text: "First step open the dashboard." }
  ]);
  const config = baseConfig({
    duration_min_s: 20,
    duration_max_s: 45,
    timeframe_start_s: 15,
    timeframe_end_s: 55
  });
  const candidates = generateCandidates(blocks, config);
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    assert.ok(candidate.start_s >= 15);
    assert.ok(candidate.end_s <= 55);
    assert.ok((candidate.end_s - candidate.start_s) >= 20);
    assert.ok((candidate.end_s - candidate.start_s) <= 45);
  }
});

test("style scoring reorders hooky vs educational", () => {
  const blocks = normalizeTranscript([
    { start: 10, end: 17, text: "How to stop this mistake in 3 steps?" },
    { start: 30, end: 38, text: "First, second and third step to configure the project." }
  ]);
  const candidates = generateCandidates(blocks, baseConfig({ duration_min_s: 20, duration_max_s: 60 }));
  const hooky = rankCandidates(candidates, baseConfig({ clip_style: "hooky" }))[0];
  const educational = rankCandidates(candidates, baseConfig({ clip_style: "educational" }))[0];
  assert.ok(hooky && educational);
  assert.notEqual(hooky.id, educational.id);
});

test("overlap control in selection avoids near-duplicates", async () => {
  const blocks = normalizeTranscript([
    { start: 10, end: 16, text: "How to fix this mistake now?" },
    { start: 17, end: 23, text: "How to fix this mistake now with another detail?" },
    { start: 60, end: 66, text: "Second part with a different topic and step." }
  ]);
  const config = baseConfig({ max_clips: 2, overlap_threshold: 0.2, min_distance_s: 20, duration_min_s: 20, duration_max_s: 45 });
  const candidates = generateCandidates(blocks, config);
  const ranked = rankCandidates(candidates, config);
  const { selectWithDiversity } = await import("@/lib/selection/select");
  const selected = selectWithDiversity(ranked, config);
  assert.ok(selected.length <= 2);
  if (selected.length === 2) {
    const a = selected[0];
    const b = selected[1];
    assert.ok(Math.abs(a.start_s - b.start_s) >= 20);
  }
});

test("include_moment_text boosts matching candidates", () => {
  const blocks = normalizeTranscript([
    { start: 5, end: 12, text: "Intro and context only." },
    { start: 30, end: 39, text: "Now we discuss pricing section and offer tiers." }
  ]);
  const base = baseConfig({ duration_min_s: 20, duration_max_s: 45, include_moment_text: "" });
  const boosted = baseConfig({ ...base, include_moment_text: "pricing section" });
  const normalTop = rankCandidates(generateCandidates(blocks, base), base)[0];
  const boostedTop = rankCandidates(generateCandidates(blocks, boosted), boosted)[0];
  assert.ok(normalTop && boostedTop);
  assert.ok(boostedTop.text_excerpt.toLowerCase().includes("pricing"));
});
