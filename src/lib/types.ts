export type JobStatus =
  | "PENDING"
  | "UPLOADED"
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
  captionPreset: "BOLD" | "CLEAN";
};

export type ClipSuggestion = {
  clip_id: string;
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
};
