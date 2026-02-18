export type JobStatus =
  | "PENDING"
  | "UPLOADED"
  | "READY_TO_PROCESS"
  | "PROCESSING"
  | "DONE"
  | "FAILED"
  | "EXPIRED";

export type CropConfig = {
  x: number;
  y: number;
  width: number;
  height: number;
  layout: "TOP_WEBCAM_BOTTOM_SCREEN";
  captionPreset: "BOLD" | "CLEAN" | "MODERN" | "MINIMAL";
  captionLanguage:
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
  outputPreset: "INSTAGRAM_REELS" | "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM_FEED";
};

export type ClipStyle = "Balanced" | "Hooky" | "Educational" | "Story";
export type ClipGenre = "Tutorial" | "Podcast" | "Talking Head" | "Interview" | "Demo" | "Other";
export type ClipLengthPreset = 30 | 60 | 90 | 180;

export type GenerationConfig = {
  clipStyle: ClipStyle;
  genre: ClipGenre;
  clipCount: number;
  clipLengthMaxS: ClipLengthPreset;
  autoHook: boolean;
  includeMomentText: string;
  timeframeStartS: number | null;
  timeframeEndS: number | null;
  presetId: string | null;
  templateId: string | null;
};

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  clipStyle: "Balanced",
  genre: "Tutorial",
  clipCount: 4,
  clipLengthMaxS: 60,
  autoHook: false,
  includeMomentText: "",
  timeframeStartS: null,
  timeframeEndS: null,
  presetId: "balanced_default",
  templateId: null
};

export type ClipSuggestion = {
  clip_id: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
};
