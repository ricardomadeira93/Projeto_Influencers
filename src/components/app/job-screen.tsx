"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Copy, Download, MessageSquareWarning, Scissors, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { JobStatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/app/language-provider";
import { cn } from "@/lib/utils";

type Clip = {
  clip_id: string;
  clip_url: string;
  title: string;
  description: string;
  hashtags: string[];
  hook: string;
  provider_metadata?: Record<string, unknown>;
};

type ClipWindow = { startSec: string; endSec: string };
type ViralityBand = "HIGH" | "MEDIUM" | "LOW";
type ClipStyle = "Balanced" | "Hooky" | "Educational" | "Story";
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

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function stageLabel(stage?: string) {
  if (!stage) return "";
  const labels: Record<string, string> = {
    UPLOADED: "Upload concluído",
    QUEUED: "Na fila",
    DOWNLOADING_SOURCE: "Baixando arquivo",
    EXTRACTING_AUDIO: "Extraindo áudio",
    TRANSCRIBING: "Transcrevendo",
    SELECTING_CLIPS: "Selecionando destaques",
    RENDERING_EXPORTS: "Renderizando clipes",
    UPLOADING_EXPORTS: "Enviando exports",
    FINALIZING: "Finalizando"
  };
  return labels[stage] || stage.toLowerCase().replace(/_/g, " ");
}

function readClipWindow(clip: Clip): { startSec: number | null; endSec: number | null } {
  const metadata = clip.provider_metadata || {};
  const rawStart = metadata.start_sec ?? metadata.startSec;
  const rawEnd = metadata.end_sec ?? metadata.endSec;
  const startSec = Number(rawStart);
  const endSec = Number(rawEnd);
  return {
    startSec: Number.isFinite(startSec) ? startSec : null,
    endSec: Number.isFinite(endSec) ? endSec : null
  };
}

function readVirality(clip: Clip): { score: number | null; band: ViralityBand | null; reasons: string[] } {
  const metadata = clip.provider_metadata || {};
  const scoreRaw = Number(metadata.virality_score);
  const bandRaw = String(metadata.virality_band || "").toUpperCase();
  const band: ViralityBand | null = bandRaw === "HIGH" || bandRaw === "MEDIUM" || bandRaw === "LOW" ? bandRaw : null;
  const reasons = Array.isArray(metadata.virality_reasons)
    ? metadata.virality_reasons.filter((item) => typeof item === "string").slice(0, 2)
    : [];
  return {
    score: Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, scoreRaw)) : null,
    band,
    reasons
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function formatSeconds(value: number) {
  return `${value.toFixed(1)}s`;
}

function formatTimecode(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "";
  const total = Math.max(0, Math.round(value));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clipDurationFromMetadata(clip: Clip) {
  const { startSec, endSec } = readClipWindow(clip);
  if (startSec === null || endSec === null) return null;
  if (endSec <= startSec) return null;
  return endSec - startSec;
}

function processingStageIndex(stage: string) {
  if (["UPLOADED", "QUEUED", "DOWNLOADING_SOURCE", "EXTRACTING_AUDIO"].includes(stage)) return 0;
  if (stage === "TRANSCRIBING") return 1;
  if (stage === "SELECTING_CLIPS") return 2;
  if (["RENDERING_EXPORTS", "UPLOADING_EXPORTS"].includes(stage)) return 3;
  if (stage === "FINALIZING") return 4;
  return 0;
}

const EDITOR_PADDING_SEC = 12;
const CLIP_STYLE_LABELS: Record<ClipStyle, string> = {
  Balanced: "Balanceado",
  Hooky: "Gancho forte",
  Educational: "Educacional",
  Story: "Narrativo"
};
const CAPTION_LANGUAGE_OPTIONS: Array<{ value: CaptionLanguage; label: string }> = [
  { value: "source", label: "Original (idioma do vídeo)" },
  { value: "en", label: "Inglês" },
  { value: "es", label: "Espanhol" },
  { value: "pt", label: "Português" },
  { value: "fr", label: "Francês" },
  { value: "de", label: "Alemão" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Holandês" },
  { value: "sv", label: "Sueco" },
  { value: "no", label: "Norueguês" },
  { value: "da", label: "Dinamarquês" },
  { value: "fi", label: "Finlandês" },
  { value: "pl", label: "Polonês" },
  { value: "tr", label: "Turco" },
  { value: "cs", label: "Tcheco" },
  { value: "ro", label: "Romeno" },
  { value: "hu", label: "Húngaro" },
  { value: "uk", label: "Ucraniano" },
  { value: "ru", label: "Russo" },
  { value: "ar", label: "Árabe" },
  { value: "hi", label: "Hindi" },
  { value: "id", label: "Indonésio" },
  { value: "ms", label: "Malaio" },
  { value: "th", label: "Tailandês" },
  { value: "vi", label: "Vietnamita" },
  { value: "ja", label: "Japonês" },
  { value: "ko", label: "Coreano" },
  { value: "zh", label: "Chinês" }
];

export function JobScreen({ jobId }: { jobId: string }) {
  const { tr } = useLanguage();
  const processingSteps = [
    "Upload concluído",
    "Transcrevendo",
    "Selecionando destaques",
    "Renderizando clipes",
    "Finalizando exports"
  ] as const;

  const loadSeqRef = useRef(0);
  const inFlightRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorVideoRef = useRef<HTMLVideoElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState("loading");
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [sourceFilename, setSourceFilename] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [jobError, setJobError] = useState("");
  const [processingStage, setProcessingStage] = useState("");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingNote, setProcessingNote] = useState("");
  const [processingModalOpen, setProcessingModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceDurationSec, setSourceDurationSec] = useState<number | null>(null);
  const [clipStyle, setClipStyle] = useState<ClipStyle>("Balanced");
  const [clipLengthMaxS, setClipLengthMaxS] = useState<number | null>(null);
  const [timeframeStartS, setTimeframeStartS] = useState<number | null>(null);
  const [timeframeEndS, setTimeframeEndS] = useState<number | null>(null);
  const [clipWindows, setClipWindows] = useState<Record<string, ClipWindow>>({});
  const [adjustingClipId, setAdjustingClipId] = useState("");
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editorStartSec, setEditorStartSec] = useState(0);
  const [editorEndSec, setEditorEndSec] = useState(0.3);
  const [editorWindowMinSec, setEditorWindowMinSec] = useState(0);
  const [editorWindowMaxSec, setEditorWindowMaxSec] = useState(0.3);
  const [editorOriginalStartSec, setEditorOriginalStartSec] = useState(0);
  const [editorOriginalEndSec, setEditorOriginalEndSec] = useState(0.3);
  const [editorAiBaselineStartSec, setEditorAiBaselineStartSec] = useState(0);
  const [editorAiBaselineEndSec, setEditorAiBaselineEndSec] = useState(0.3);
  const [editorSessionStartedAt, setEditorSessionStartedAt] = useState<number | null>(null);
  const [nudgeCountStart, setNudgeCountStart] = useState(0);
  const [nudgeCountEnd, setNudgeCountEnd] = useState(0);
  const [setAtPlayheadCount, setSetAtPlayheadCount] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [editorPlayheadSec, setEditorPlayheadSec] = useState(0);
  const [draggingHandle, setDraggingHandle] = useState<"start" | "end" | null>(null);
  const [loopSelection, setLoopSelection] = useState(false);

  const [crop, setCrop] = useState({
    x: 0.72,
    y: 0.7,
    width: 0.26,
    height: 0.26,
    layout: "TOP_WEBCAM_BOTTOM_SCREEN",
    captionPreset: "BOLD",
    captionLanguage: "source" as CaptionLanguage,
    outputPreset: "INSTAGRAM_REELS"
  });

  async function load(options?: { reset?: boolean; fetchPreview?: boolean }) {
    const reset = options?.reset ?? false;
    const fetchPreview = options?.fetchPreview ?? false;
    if (!reset && inFlightRef.current) return;

    const seq = ++loadSeqRef.current;
    inFlightRef.current = true;

    if (reset) {
      setLoading(true);
      setStatus("loading");
      setJobError("");
      setProcessingStage("");
      setProcessingProgress(0);
      setProcessingNote("");
      setMessage("");
      setClips([]);
      setSourcePreviewUrl("");
    } else {
      setRefreshing(true);
    }

    try {
      const res = await fetch(`/api/jobs/${jobId}/suggest`, { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (seq !== loadSeqRef.current) return;

      if (!res.ok) {
        setStatus(data.error || "error");
        if (reset) setLoading(false);
        setRefreshing(false);
        return;
      }

      setStatus(data.job.status);
      setJobError(data.job.error_message || "");
      setProcessingStage(data.job.processing_stage || "");
      setProcessingProgress(Number(data.job.processing_progress || 0));
      setProcessingNote(data.job.processing_note || "");
      setSourceFilename(String(data.job.source_filename || ""));
      setClipStyle((data.job.clip_style as ClipStyle) || "Balanced");
      setClipLengthMaxS(Number(data.job.clip_length_max_s || 0) || null);
      setTimeframeStartS(data.job.timeframe_start_s === null ? null : Number(data.job.timeframe_start_s || 0) || null);
      setTimeframeEndS(data.job.timeframe_end_s === null ? null : Number(data.job.timeframe_end_s || 0) || null);

      const exportsList = (data.exports || []) as Clip[];
      setClips(exportsList);
      setSelectedClipId((prev) => {
        if (!exportsList.length) return null;
        if (prev && exportsList.some((clip) => clip.clip_id === prev)) return prev;
        return exportsList[0].clip_id;
      });

      setSourceDurationSec(Number(data.job.source_duration_sec || 0) || null);
      setClipWindows((prev) => {
        const next: Record<string, ClipWindow> = {};
        for (const clip of exportsList) {
          if (prev[clip.clip_id]) {
            next[clip.clip_id] = prev[clip.clip_id];
            continue;
          }
          const { startSec, endSec } = readClipWindow(clip);
          next[clip.clip_id] = {
            startSec: startSec === null ? "0" : startSec.toFixed(1),
            endSec: endSec === null ? "" : endSec.toFixed(1)
          };
        }
        return next;
      });

      if (data.job.crop_config) {
        setCrop((prev) => ({ ...prev, ...data.job.crop_config }));
      }

      if (fetchPreview) {
        const previewRes = await fetch(`/api/jobs/${jobId}/preview`, { headers: await authHeaders(), cache: "no-store" });
        const previewData = await previewRes.json().catch(() => ({}));
        if (seq !== loadSeqRef.current) return;
        if (previewRes.ok) setSourcePreviewUrl(previewData.previewUrl || "");
      }

      if (reset) setLoading(false);
      setRefreshing(false);
    } finally {
      if (seq === loadSeqRef.current) inFlightRef.current = false;
    }
  }

  function scheduleRealtimeRefresh(fetchPreview = false) {
    if (realtimeRefreshTimerRef.current) {
      clearTimeout(realtimeRefreshTimerRef.current);
    }
    realtimeRefreshTimerRef.current = setTimeout(() => {
      load({ reset: false, fetchPreview }).catch(console.error);
    }, 350);
  }

  async function saveCrop() {
    await fetch(`/api/jobs/${jobId}/crop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(crop)
    });
    toast.success(tr("job.saveCrop"));
    await load();
  }

  function resetCrop() {
    setCrop({
      x: 0.72,
      y: 0.7,
      width: 0.26,
      height: 0.26,
      layout: "TOP_WEBCAM_BOTTOM_SCREEN",
      captionPreset: "BOLD",
      captionLanguage: "source",
      outputPreset: "INSTAGRAM_REELS"
    });
  }

  async function generate() {
    setMessage(tr("job.queueing"));
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ status: "READY_TO_PROCESS" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMessage = data.error || tr("job.queueError");
      setMessage(errMessage);
      toast.error(errMessage);
      return;
    }
    setMessage(tr("job.queued"));
    toast.success(tr("job.queued"));
    await load();
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(label);
  }

  async function adjustClip(clipId: string, startSec: number, endSec: number) {
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      toast.error(tr("job.adjustClipInvalid"));
      return;
    }

    setAdjustingClipId(clipId);
    const sessionDurationMs =
      editorSessionStartedAt && Number.isFinite(editorSessionStartedAt)
        ? Math.max(0, Date.now() - editorSessionStartedAt)
        : null;

    fetch(`/api/jobs/${jobId}/clips/${clipId}/adjustment-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        aiStartS: editorAiBaselineStartSec,
        aiEndS: editorAiBaselineEndSec,
        finalStartS: startSec,
        finalEndS: endSec,
        nudgeCountStart,
        nudgeCountEnd,
        setAtPlayheadCount,
        resetCount,
        sessionDurationMs
      })
    }).catch(() => undefined);

    try {
      const res = await fetch(`/api/jobs/${jobId}/clips/${clipId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ startSec, endSec })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || tr("job.adjustClipError"));
        return;
      }

      const updatedClip = data.clip as Partial<Clip> | undefined;
      if (updatedClip?.clip_url) {
        setClips((prev) =>
          prev.map((clip) =>
            clip.clip_id === clipId
              ? {
                  ...clip,
                  clip_url: updatedClip.clip_url as string,
                  provider_metadata: updatedClip.provider_metadata as Record<string, unknown>
                }
              : clip
          )
        );
      }

      setClipWindows((prev) => ({
        ...prev,
        [clipId]: {
          startSec: startSec.toFixed(1),
          endSec: endSec.toFixed(1)
        }
      }));
      toast.success(tr("job.adjustClipSuccess"));
      setEditingClipId(null);
    } finally {
      setAdjustingClipId("");
    }
  }

  function openClipEditor(clip: Clip) {
    const window = clipWindows[clip.clip_id];
    const parsedStart = Number(window?.startSec ?? 0);
    const parsedEnd = Number(window?.endSec ?? sourceDurationSec ?? 0.3);
    const metadata = clip.provider_metadata || {};
    const aiStartRaw = Number(metadata.ai_start_sec ?? metadata.start_sec ?? parsedStart);
    const aiEndRaw = Number(metadata.ai_end_sec ?? metadata.end_sec ?? parsedEnd);
    const maxDuration = Math.max(0.3, sourceDurationSec || parsedEnd || 0.3);
    const safeStart = clamp(Number.isFinite(parsedStart) ? parsedStart : 0, 0, Math.max(0, maxDuration - 0.3));
    const safeEnd = clamp(Number.isFinite(parsedEnd) ? parsedEnd : maxDuration, safeStart + 0.3, maxDuration);
    const safeAiStart = clamp(Number.isFinite(aiStartRaw) ? aiStartRaw : safeStart, 0, Math.max(0, maxDuration - 0.3));
    const safeAiEnd = clamp(Number.isFinite(aiEndRaw) ? aiEndRaw : safeEnd, safeAiStart + 0.3, maxDuration);
    const windowMin = clamp(safeStart - EDITOR_PADDING_SEC, 0, Math.max(0, maxDuration - 0.3));
    const windowMax = clamp(safeEnd + EDITOR_PADDING_SEC, windowMin + 0.3, maxDuration);

    setEditorWindowMinSec(windowMin);
    setEditorWindowMaxSec(windowMax);
    setEditorOriginalStartSec(safeStart);
    setEditorOriginalEndSec(safeEnd);
    setEditorAiBaselineStartSec(safeAiStart);
    setEditorAiBaselineEndSec(safeAiEnd);
    setEditorSessionStartedAt(Date.now());
    setNudgeCountStart(0);
    setNudgeCountEnd(0);
    setSetAtPlayheadCount(0);
    setResetCount(0);
    setEditorStartSec(safeStart);
    setEditorEndSec(safeEnd);
    setEditorPlayheadSec(safeStart);
    setLoopSelection(false);
    setEditingClipId(clip.clip_id);
  }

  const editingClip = useMemo(() => clips.find((clip) => clip.clip_id === editingClipId) || null, [clips, editingClipId]);
  const selectedClip = useMemo(() => clips.find((clip) => clip.clip_id === selectedClipId) || clips[0] || null, [clips, selectedClipId]);

  const timelineMin = Math.min(editorWindowMinSec, editorWindowMaxSec - 0.3);
  const timelineMax = Math.max(editorWindowMaxSec, timelineMin + 0.3);
  const timelineRange = Math.max(0.3, timelineMax - timelineMin);
  const selectionLeft = Math.min(100, Math.max(0, ((editorStartSec - timelineMin) / timelineRange) * 100));
  const selectionWidth = Math.min(100 - selectionLeft, Math.max(0.2, ((editorEndSec - editorStartSec) / timelineRange) * 100));
  const playheadLeft = Math.min(100, Math.max(0, ((editorPlayheadSec - timelineMin) / timelineRange) * 100));

  function setHandleFromClientX(handle: "start" | "end", clientX: number) {
    const track = timelineTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = rect.width <= 0 ? 0 : clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextSec = timelineMin + ratio * timelineRange;

    if (handle === "start") {
      const nextStart = Math.min(nextSec, editorEndSec - 0.3);
      setEditorStartSec(nextStart);
      setEditorPlayheadSec(nextStart);
      if (editorVideoRef.current) editorVideoRef.current.currentTime = nextStart;
      return;
    }

    const nextEnd = Math.max(nextSec, editorStartSec + 0.3);
    setEditorEndSec(nextEnd);
    setEditorPlayheadSec(nextEnd);
    if (editorVideoRef.current) editorVideoRef.current.currentTime = Math.max(editorStartSec, nextEnd - 0.05);
  }

  function seekEditor(sec: number) {
    const safe = clamp(sec, timelineMin, timelineMax);
    setEditorPlayheadSec(safe);
    if (editorVideoRef.current) editorVideoRef.current.currentTime = safe;
  }

  function markInAtPlayhead() {
    const nextStart = clamp(editorPlayheadSec, timelineMin, editorEndSec - 0.3);
    setEditorStartSec(nextStart);
    setSetAtPlayheadCount((prev) => prev + 1);
    if (editorVideoRef.current) editorVideoRef.current.currentTime = nextStart;
  }

  function markOutAtPlayhead() {
    const nextEnd = clamp(editorPlayheadSec, editorStartSec + 0.3, timelineMax);
    setEditorEndSec(nextEnd);
    setSetAtPlayheadCount((prev) => prev + 1);
    if (editorVideoRef.current) editorVideoRef.current.currentTime = Math.max(editorStartSec, nextEnd - 0.05);
  }

  function nudgeIn(delta: number) {
    const next = clamp(editorStartSec + delta, timelineMin, editorEndSec - 0.3);
    setEditorStartSec(next);
    setNudgeCountStart((prev) => prev + 1);
    seekEditor(next);
  }

  function nudgeOut(delta: number) {
    const next = clamp(editorEndSec + delta, editorStartSec + 0.3, timelineMax);
    setEditorEndSec(next);
    setNudgeCountEnd((prev) => prev + 1);
    seekEditor(next);
  }

  function previewSelection() {
    setLoopSelection(true);
    if (!editorVideoRef.current) return;
    editorVideoRef.current.currentTime = editorStartSec;
    void editorVideoRef.current.play().catch(() => undefined);
  }

  function pausePreview() {
    setLoopSelection(false);
    if (!editorVideoRef.current) return;
    editorVideoRef.current.pause();
  }

  function resetSelection() {
    setEditorStartSec(editorOriginalStartSec);
    setEditorEndSec(editorOriginalEndSec);
    setResetCount((prev) => prev + 1);
    seekEditor(editorOriginalStartSec);
  }

  useEffect(() => {
    const video = editorVideoRef.current;
    if (!video || !editingClipId) return;
    const onTimeUpdate = () => {
      setEditorPlayheadSec(video.currentTime);
      if (loopSelection && video.currentTime >= editorEndSec) {
        video.currentTime = editorStartSec;
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [editingClipId, editorStartSec, editorEndSec, loopSelection]);

  useEffect(() => {
    if (!draggingHandle) return;
    const onPointerMove = (event: PointerEvent) => setHandleFromClientX(draggingHandle, event.clientX);
    const onPointerUp = () => setDraggingHandle(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draggingHandle, timelineMin, timelineRange, editorStartSec, editorEndSec]);

  useEffect(() => {
    load({ reset: true, fetchPreview: true }).catch(console.error);
    return () => {
      loadSeqRef.current += 1;
    };
  }, [jobId]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`job-live-${jobId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` }, (payload) => {
        const row = (payload.new || {}) as Record<string, unknown>;
        if (typeof row.status === "string") setStatus(row.status);
        if (typeof row.error_message === "string" || row.error_message === null) setJobError(String(row.error_message || ""));
        if (typeof row.processing_stage === "string" || row.processing_stage === null) setProcessingStage(String(row.processing_stage || ""));
        if (typeof row.processing_progress === "number") setProcessingProgress(Number(row.processing_progress));
        if (typeof row.processing_note === "string" || row.processing_note === null) setProcessingNote(String(row.processing_note || ""));
        if (typeof row.source_filename === "string") setSourceFilename(row.source_filename);
        if (typeof row.clip_style === "string") setClipStyle((row.clip_style as ClipStyle) || "Balanced");
        if (typeof row.clip_length_max_s === "number") setClipLengthMaxS(Number(row.clip_length_max_s) || null);
        if (row.timeframe_start_s !== undefined) {
          const start = Number(row.timeframe_start_s);
          setTimeframeStartS(Number.isFinite(start) ? start : null);
        }
        if (row.timeframe_end_s !== undefined) {
          const end = Number(row.timeframe_end_s);
          setTimeframeEndS(Number.isFinite(end) ? end : null);
        }

        scheduleRealtimeRefresh(false);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "job_exports", filter: `job_id=eq.${jobId}` }, () => {
        scheduleRealtimeRefresh(false);
      })
      .subscribe();

    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      supabaseBrowser.removeChannel(channel);
    };
  }, [jobId]);

  useEffect(() => {
    const activeStatuses = new Set(["READY_TO_PROCESS", "PROCESSING"]);
    if (!activeStatuses.has(status)) return;

    const timer = setInterval(() => {
      if (document.hidden) return;
      load({ reset: false, fetchPreview: false }).catch(console.error);
    }, 5000);

    return () => clearInterval(timer);
  }, [jobId, status]);

  const stepStates = useMemo(() => {
    if (status === "DONE") return ["done", "done", "done", "done", "done"] as const;
    if (status === "PROCESSING") {
      const idx = processingStageIndex(processingStage || "QUEUED");
      return processingSteps.map((_, index) => {
        if (index < idx) return "done";
        if (index === idx) return "in_progress";
        return "pending";
      }) as readonly ("done" | "in_progress" | "pending")[];
    }
    if (status === "FAILED") {
      const idx = processingStageIndex(processingStage || "QUEUED");
      return processingSteps.map((_, index) => (index <= idx ? "done" : "pending")) as readonly (
        | "done"
        | "in_progress"
        | "pending")[];
    }
    return ["pending", "pending", "pending", "pending", "pending"] as const;
  }, [status, processingStage, processingSteps]);

  const progressValue = useMemo(() => {
    if (status === "DONE") return 100;
    if (status === "PROCESSING" && processingProgress > 0) return Math.min(99, Math.max(1, processingProgress));
    const doneCount = stepStates.filter((s) => s === "done").length;
    const inProgressCount = stepStates.filter((s) => s === "in_progress").length;
    return ((doneCount + inProgressCount * 0.5) / processingSteps.length) * 100;
  }, [stepStates, processingProgress, status, processingSteps]);

  const estimatedWaitMin = useMemo(() => {
    const durationMin = Math.max(1, (sourceDurationSec || 60) / 60);
    const totalEstimate = Math.max(2, Math.round(durationMin * 1.4 + 2));
    if (status === "DONE") return 0;
    if (status !== "PROCESSING") return totalEstimate;
    const remaining = totalEstimate * (1 - Math.min(99, Math.max(1, processingProgress)) / 100);
    return Math.max(1, Math.ceil(remaining));
  }, [processingProgress, sourceDurationSec, status]);

  const timeframeLabel =
    timeframeStartS === null && timeframeEndS === null
      ? "Vídeo completo"
      : `${formatTimecode(timeframeStartS)} - ${formatTimecode(timeframeEndS)}`;

  async function sendFailureFeedback() {
    const text = window.prompt("Descreva o que falhou para melhorarmos o processamento:", `Job ${jobId} falhou: ${jobError}`);
    if (!text?.trim()) return;
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[Job ${jobId}] ${text.trim()}` })
    });
    if (!res.ok) {
      toast.error("Não foi possível enviar o feedback.");
      return;
    }
    toast.success("Feedback enviado. Obrigado.");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={tr("job.workspace")} subtitle={tr("job.workspaceBody")} actions={<JobStatusBadge status={status} />} />

      {(status === "PROCESSING" || status === "FAILED") && (
        <button
          type="button"
          onClick={() => setProcessingModalOpen(true)}
          className={cn(
            "w-full rounded-xl border p-4 text-left shadow-sm transition-colors",
            status === "FAILED" ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5 hover:bg-primary/10"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{status === "FAILED" ? "Processamento com falha" : "Seu vídeo está processando"}</p>
              <p className="text-xs text-muted-foreground">
                {status === "FAILED" ? "Abra os detalhes para tentar novamente ou enviar feedback." : `${Math.round(progressValue)}% concluído - clique para ver detalhes`}
              </p>
            </div>
            <Button size="sm" variant={status === "FAILED" ? "destructive" : "default"}>
              {status === "FAILED" ? "Ver falha" : "Ver progresso"}
            </Button>
          </div>
        </button>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <Card className="hover-lift rounded-xl border-border/70">
          <CardHeader>
            <CardTitle>{tr("job.previewTitle")}</CardTitle>
            <CardDescription>{tr("job.previewBody")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              {sourcePreviewUrl ? (
                <video
                  src={sourcePreviewUrl}
                  controls
                  preload="metadata"
                  className="w-full rounded-md bg-black"
                  aria-label={tr("job.sourcePreviewAria")}
                />
              ) : (
                <div className="h-44 w-full rounded-md bg-muted" />
              )}
              <p className="mt-2 text-xs text-muted-foreground">{tr("job.previewHelp")}</p>
            </div>

            <div className="space-y-1">
              <Label>{tr("job.outputFormat")}</Label>
              <Select
                value={crop.outputPreset || "INSTAGRAM_REELS"}
                onValueChange={(value) =>
                  setCrop({
                    ...crop,
                    outputPreset: value as "INSTAGRAM_REELS" | "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM_FEED"
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("job.outputFormat")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INSTAGRAM_REELS">{tr("job.outputPreset.instagramReels")}</SelectItem>
                  <SelectItem value="YOUTUBE_SHORTS">{tr("job.outputPreset.youtubeShorts")}</SelectItem>
                  <SelectItem value="TIKTOK">{tr("job.outputPreset.tiktok")}</SelectItem>
                  <SelectItem value="INSTAGRAM_FEED">{tr("job.outputPreset.instagramFeed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>{tr("job.captionStyle")}</Label>
              <Select
                value={crop.captionPreset}
                onValueChange={(value) => setCrop({ ...crop, captionPreset: value as "BOLD" | "CLEAN" | "MODERN" | "MINIMAL" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("job.captionStyle")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLD">{tr("job.bold")}</SelectItem>
                  <SelectItem value="CLEAN">{tr("job.clean")}</SelectItem>
                  <SelectItem value="MODERN">{tr("job.modern")}</SelectItem>
                  <SelectItem value="MINIMAL">{tr("job.minimal")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>{tr("job.captionLanguage")}</Label>
              <Select
                value={crop.captionLanguage || "source"}
                onValueChange={(value) => setCrop({ ...crop, captionLanguage: value as CaptionLanguage })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("job.captionLanguage")} />
                </SelectTrigger>
                <SelectContent>
                  {CAPTION_LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={saveCrop}>
                {tr("job.saveCrop")}
              </Button>
              <Button variant="ghost" onClick={resetCrop}>
                {tr("job.reset")}
              </Button>
              <Button onClick={generate}>
                <WandSparkles className="mr-2 h-4 w-4" />
                {tr("job.generate")}
              </Button>
            </div>
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            {status === "FAILED" && jobError ? <p className="text-sm text-destructive">{tr("job.failed")} {jobError}</p> : null}
          </CardContent>
        </Card>

        <Card className="hover-lift rounded-xl border-border/70 bg-gradient-to-b from-muted/35 to-background">
          <CardHeader>
            <CardTitle>Resumo da curadoria</CardTitle>
            <CardDescription>Configuração aplicada neste job.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border bg-background/80 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Arquivo</p>
              <p className="mt-1 font-medium">{sourceFilename || "Arquivo sem nome"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Método de curadoria</p>
                <p className="mt-1 font-medium">{CLIP_STYLE_LABELS[clipStyle] || clipStyle}</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Limite de duração</p>
                <p className="mt-1 font-medium">{clipLengthMaxS ? `0-${clipLengthMaxS}s` : "Padrão"}</p>
              </div>
            </div>
            <div className="rounded-lg border bg-background/80 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Recorte de tempo</p>
              <p className="mt-1 font-medium">{timeframeLabel}</p>
            </div>
            <div className="rounded-lg border bg-background/80 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Processamento</p>
              <div className="mt-2 space-y-2">
                <Progress value={progressValue} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{Math.round(progressValue)}%</span>
                  <span>{stageLabel(processingStage) || tr("dashboard.processing")}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              {estimatedWaitMin > 0 ? `Tempo estimado: ~${estimatedWaitMin} min` : "Processamento concluído"}
            </div>
            {processingNote ? <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">{processingNote}</div> : null}
            {refreshing ? <p className="text-xs text-muted-foreground">{tr("job.refreshing")}</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border-border/70">
        <CardHeader>
          <CardTitle>{tr("job.results")}</CardTitle>
          <CardDescription>{tr("job.resultsBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <ul className="space-y-2">
              <li><Skeleton className="h-20 w-full" /></li>
              <li><Skeleton className="h-20 w-full" /></li>
            </ul>
          ) : null}

          {!loading && !clips.length ? (
            <EmptyState icon={Scissors} title="Ainda sem clipes" description={tr("job.noClips")} />
          ) : null}

          {!loading && clips.length ? (
            <div className="grid gap-4 lg:grid-cols-[300px,minmax(0,560px)] lg:justify-between">
              <div className="space-y-2">
                {clips.map((clip) => {
                  const duration = clipDurationFromMetadata(clip);
                  const virality = readVirality(clip);
                  const selected = selectedClip?.clip_id === clip.clip_id;
                  return (
                    <button
                      key={clip.clip_id}
                      type="button"
                      onClick={() => setSelectedClipId(clip.clip_id)}
                      className={cn(
                        "w-full rounded-lg border p-2 text-left transition-colors",
                        selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/30"
                      )}
                    >
                      <div className="grid grid-cols-[88px,1fr] gap-3">
                        <video
                          src={clip.clip_url}
                          preload="metadata"
                          muted
                          playsInline
                          className="h-16 w-24 rounded-md bg-muted object-cover"
                          aria-label={`${tr("job.clipPreviewAria")} ${clip.title}`}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{clip.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{clip.hook}</p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            {duration !== null ? <span>{duration.toFixed(1)}s</span> : null}
                            {virality.score !== null ? <span>Pontuação {virality.score.toFixed(0)}</span> : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedClip ? (
                <div className="space-y-3 rounded-xl border p-4 lg:w-full">
                  <video
                    src={selectedClip.clip_url}
                    controls
                    className="aspect-[9/16] w-full max-h-[70vh] rounded-lg bg-muted object-contain"
                    aria-label={`${tr("job.clipPreviewAria")} ${selectedClip.title}`}
                  />
                  <div>
                    <p className="text-lg font-semibold">{selectedClip.title}</p>
                    <p className="text-sm text-muted-foreground">{selectedClip.hook}</p>
                  </div>
                  {(() => {
                    const virality = readVirality(selectedClip);
                    if (virality.score === null) return null;
                    return (
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr("job.viralityScore")}</p>
                          <p className="text-sm font-semibold">{virality.score.toFixed(1)}/100</p>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${virality.score}%` }} />
                        </div>
                        {virality.band ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {tr("job.viralityBand")} {tr(`job.viralityBand.${virality.band.toLowerCase()}`)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()}
                  <p className="text-sm text-muted-foreground">{selectedClip.description}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <a href={selectedClip.clip_url} target="_blank" rel="noreferrer">
                        <Download className="mr-2 h-4 w-4" />
                        {tr("job.download")}
                      </a>
                    </Button>
                    <Button variant="secondary" onClick={() => copyText(selectedClip.title, tr("job.copyTitleToast"))}>
                      <Copy className="mr-2 h-4 w-4" />
                      {tr("job.copyTitle")}
                    </Button>
                    <Button variant="secondary" onClick={() => copyText(selectedClip.hashtags.join(" "), tr("job.copyHashtagsToast"))}>
                      <Copy className="mr-2 h-4 w-4" />
                      {tr("job.copyHashtags")}
                    </Button>
                    <Button variant="outline" onClick={() => openClipEditor(selectedClip)}>
                      <Scissors className="mr-2 h-4 w-4" />
                      {tr("job.openTimelineEditor")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{tr("job.available72h")}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={processingModalOpen} onOpenChange={setProcessingModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{status === "FAILED" ? "Processamento com falha" : "Seu vídeo está processando"}</DialogTitle>
            <DialogDescription>
              {status === "FAILED" ? "Este job foi interrompido antes de concluir." : "Estamos executando sua curadoria com IA."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
                <p><span className="text-muted-foreground">Arquivo:</span> {sourceFilename || "Arquivo sem nome"}</p>
                <p><span className="text-muted-foreground">Método de curadoria:</span> {CLIP_STYLE_LABELS[clipStyle] || clipStyle}</p>
                <p><span className="text-muted-foreground">Recorte de tempo:</span> {timeframeLabel}</p>
                <p><span className="text-muted-foreground">Duração preferida:</span> {clipLengthMaxS ? `0-${clipLengthMaxS}s` : "Padrão"}</p>
                <p><span className="text-muted-foreground">Tempo estimado:</span> {estimatedWaitMin > 0 ? `~${estimatedWaitMin} min` : "Concluído"}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium">{Math.round(progressValue)}%</p>
                  <p className="text-muted-foreground">{stageLabel(processingStage) || tr("dashboard.processing")}</p>
                </div>
                <Progress value={progressValue} />
              </div>

              <ul className="space-y-2">
                {processingSteps.map((step, index) => (
                  <li
                    key={step}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                      stepStates[index] === "in_progress" && "border-primary/40 bg-primary/5",
                      stepStates[index] === "done" && "border-success/30 bg-success/10"
                    )}
                  >
                    <span>{step}</span>
                    <span className="text-xs text-muted-foreground">
                      {stepStates[index] === "in_progress"
                        ? tr("job.inProgress")
                        : stepStates[index] === "done"
                          ? tr("job.doneState")
                          : tr("job.pendingState")}
                    </span>
                  </li>
                ))}
              </ul>

              {processingNote ? <p className="text-xs text-muted-foreground">{processingNote}</p> : null}
              {status === "FAILED" && jobError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{jobError}</div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            {status === "FAILED" ? (
              <>
                <Button variant="outline" onClick={sendFailureFeedback}>
                  <MessageSquareWarning className="mr-2 h-4 w-4" />
                  Enviar feedback
                </Button>
                <Button onClick={generate}>Tentar novamente</Button>
              </>
            ) : (
              <Button onClick={() => setProcessingModalOpen(false)}>Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingClipId)} onOpenChange={(open) => !open && setEditingClipId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr("job.trimTitle")}</DialogTitle>
            <DialogDescription>{tr("job.timelineEditorBody")}</DialogDescription>
          </DialogHeader>

          {editingClip ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr("job.editingClipId")} {editingClip.clip_id}</p>
                <p className="text-sm font-medium">{editingClip.title}</p>
                <p className="text-xs text-muted-foreground">{tr("job.editWindow")} {formatSeconds(timelineMin)} - {formatSeconds(timelineMax)}</p>
              </div>

              <video
                ref={editorVideoRef}
                src={sourcePreviewUrl || editingClip.clip_url}
                controls
                preload="metadata"
                className="w-full rounded-md bg-black"
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = editorStartSec;
                }}
              />

              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatSeconds(timelineMin)}</span>
                  <span>{tr("job.playhead")} {formatSeconds(editorPlayheadSec)}</span>
                  <span>{formatSeconds(timelineMax)}</span>
                </div>
                <div
                  ref={timelineTrackRef}
                  className="relative h-3 cursor-pointer rounded-full bg-muted"
                  onPointerDown={(event) => {
                    seekEditor(
                      timelineMin +
                        ((event.clientX - (timelineTrackRef.current?.getBoundingClientRect().left || 0)) /
                          (timelineTrackRef.current?.getBoundingClientRect().width || 1)) *
                          timelineRange
                    );
                  }}
                >
                  <div className="absolute top-0 h-3 rounded-full bg-primary/70" style={{ left: `${selectionLeft}%`, width: `${selectionWidth}%` }} />
                  <div className="absolute top-[-3px] h-5 w-[2px] bg-foreground/80" style={{ left: `${playheadLeft}%` }} />
                  <button
                    type="button"
                    aria-label={tr("job.trimStart")}
                    className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-primary bg-background"
                    style={{ left: `${selectionLeft}%`, transform: "translate(-50%, -50%)" }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDraggingHandle("start");
                    }}
                  />
                  <button
                    type="button"
                    aria-label={tr("job.trimEnd")}
                    className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-primary bg-background"
                    style={{ left: `${selectionLeft + selectionWidth}%`, transform: "translate(-50%, -50%)" }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDraggingHandle("end");
                    }}
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="secondary" onClick={markInAtPlayhead}>{tr("job.markIn")}</Button>
                  <Button type="button" variant="secondary" onClick={markOutAtPlayhead}>{tr("job.markOut")}</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Button type="button" variant="ghost" onClick={() => nudgeIn(-0.5)}>{tr("job.nudgeInBack")}</Button>
                  <Button type="button" variant="ghost" onClick={() => nudgeIn(0.5)}>{tr("job.nudgeInForward")}</Button>
                  <Button type="button" variant="ghost" onClick={() => nudgeOut(-0.5)}>{tr("job.nudgeOutBack")}</Button>
                  <Button type="button" variant="ghost" onClick={() => nudgeOut(0.5)}>{tr("job.nudgeOutForward")}</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Button type="button" variant="outline" onClick={() => seekEditor(editorStartSec)}>{tr("job.goToIn")}</Button>
                  <Button type="button" variant="outline" onClick={() => seekEditor(editorEndSec)}>{tr("job.goToOut")}</Button>
                  <Button type="button" variant="outline" onClick={previewSelection}>{tr("job.previewSelection")}</Button>
                  <Button type="button" variant="outline" onClick={pausePreview}>{tr("job.pausePreview")}</Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="editor-start-input">{tr("job.trimStart")}</Label>
                  <Input
                    id="editor-start-input"
                    type="number"
                    min={timelineMin}
                    max={timelineMax}
                    step={0.1}
                    value={editorStartSec.toFixed(1)}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next)) return;
                      setEditorStartSec(clamp(next, timelineMin, editorEndSec - 0.3));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="editor-end-input">{tr("job.trimEnd")}</Label>
                  <Input
                    id="editor-end-input"
                    type="number"
                    min={timelineMin}
                    max={timelineMax}
                    step={0.1}
                    value={editorEndSec.toFixed(1)}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next)) return;
                      setEditorEndSec(clamp(next, editorStartSec + 0.3, timelineMax));
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="ghost" onClick={resetSelection}>{tr("job.resetSelection")}</Button>
              </div>
            </div>
          ) : null}

          <DialogFooter className="sticky bottom-0 border-t bg-background pt-3">
            <Button variant="ghost" onClick={() => setEditingClipId(null)}>{tr("job.cancelAdjustClip")}</Button>
            <Button
              onClick={() => editingClipId && adjustClip(editingClipId, editorStartSec, editorEndSec)}
              disabled={!editingClipId || adjustingClipId === editingClipId}
            >
              {editingClipId && adjustingClipId === editingClipId ? tr("job.adjustingClip") : tr("job.adjustClip")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
