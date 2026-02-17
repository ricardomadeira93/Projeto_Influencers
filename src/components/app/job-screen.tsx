"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { JobStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type Clip = {
  clip_id: string;
  clip_url: string;
  title: string;
  description: string;
  hashtags: string[];
  hook: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const processingSteps = ["Transcribing", "Selecting clips", "Rendering exports"] as const;

function stageLabel(stage?: string) {
  if (!stage) return "";
  return stage
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function JobScreen({ jobId }: { jobId: string }) {
  const loadSeqRef = useRef(0);
  const inFlightRef = useRef(false);
  const [status, setStatus] = useState("loading");
  const [clips, setClips] = useState<Clip[]>([]);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [jobError, setJobError] = useState("");
  const [processingStage, setProcessingStage] = useState("");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingNote, setProcessingNote] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [crop, setCrop] = useState({
    x: 0.72,
    y: 0.7,
    width: 0.26,
    height: 0.26,
    layout: "TOP_WEBCAM_BOTTOM_SCREEN",
    captionPreset: "BOLD"
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
      const data = await res.json();
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
      setClips(data.exports || []);
      if (data.job.crop_config) setCrop(data.job.crop_config);

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

  async function saveCrop() {
    await fetch(`/api/jobs/${jobId}/crop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(crop)
    });
    toast.success("Crop settings saved");
    await load();
  }

  async function resetCrop() {
    setCrop({
      x: 0.72,
      y: 0.7,
      width: 0.26,
      height: 0.26,
      layout: "TOP_WEBCAM_BOTTOM_SCREEN",
      captionPreset: "BOLD"
    });
  }

  async function generate() {
    setMessage("Queueing video...");
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ status: "READY_TO_PROCESS" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMessage =
        data?.code === "DISPATCH_FORBIDDEN"
          ? "Processing trigger is misconfigured (GitHub token permissions)."
          : data.error || "Could not queue video";
      setMessage(errMessage);
      toast.error(errMessage);
      return;
    }
    setMessage("Video queued for processing.");
    toast.success("Video queued");
    await load();
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  useEffect(() => {
    load({ reset: true, fetchPreview: true }).catch(console.error);
    return () => {
      loadSeqRef.current += 1;
    };
  }, [jobId]);

  useEffect(() => {
    const activeStatuses = new Set(["READY_TO_PROCESS", "PROCESSING"]);
    if (!activeStatuses.has(status)) return;

    const t = setInterval(() => {
      if (document.hidden) return;
      load({ reset: false, fetchPreview: false }).catch(console.error);
    }, 15000);
    return () => {
      clearInterval(t);
    };
  }, [jobId, status]);

  const stepStates = useMemo(() => {
    if (status === "DONE") return ["done", "done", "done"] as const;
    if (status === "PROCESSING") {
      if (["DOWNLOADING_SOURCE", "EXTRACTING_AUDIO", "TRANSCRIBING", "QUEUED"].includes(processingStage)) {
        return ["in_progress", "pending", "pending"] as const;
      }
      if (processingStage === "SELECTING_CLIPS") {
        return ["done", "in_progress", "pending"] as const;
      }
      if (["RENDERING_EXPORTS", "UPLOADING_EXPORTS", "FINALIZING"].includes(processingStage)) {
        return ["done", "done", "in_progress"] as const;
      }
      return ["in_progress", "pending", "pending"] as const;
    }
    if (status === "FAILED") return ["in_progress", "pending", "pending"] as const;
    return ["pending", "pending", "pending"] as const;
  }, [status, processingStage]);

  const progressValue = useMemo(() => {
    if (status === "DONE") return 100;
    if (status === "PROCESSING" && processingProgress > 0) return Math.min(99, Math.max(1, processingProgress));
    const doneCount = stepStates.filter((s) => s === "done").length;
    const inProgressCount = stepStates.filter((s) => s === "in_progress").length;
    return ((doneCount + inProgressCount * 0.5) / processingSteps.length) * 100;
  }, [stepStates, processingProgress, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Video workspace</h1>
          <p className="text-sm text-muted-foreground">Configure crop, start processing, and collect clip exports.</p>
        </div>
        <JobStatusBadge status={status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Preview and crop</CardTitle>
            <CardDescription>Set webcam crop values before generation. Use decimal values from 0 to 1.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              {sourcePreviewUrl ? (
                <video
                  src={sourcePreviewUrl}
                  controls
                  preload="metadata"
                  className="w-full rounded-md bg-black"
                  aria-label="Source video preview"
                />
              ) : (
                <div className="h-44 w-full rounded-md bg-muted" />
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Source preview helps validate framing before generating clips.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>x</Label>
                <Input type="number" step="0.01" value={crop.x} onChange={(e) => setCrop({ ...crop, x: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>y</Label>
                <Input type="number" step="0.01" value={crop.y} onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>width</Label>
                <Input type="number" step="0.01" value={crop.width} onChange={(e) => setCrop({ ...crop, width: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>height</Label>
                <Input type="number" step="0.01" value={crop.height} onChange={(e) => setCrop({ ...crop, height: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Caption style</Label>
              <Select value={crop.captionPreset} onValueChange={(value) => setCrop({ ...crop, captionPreset: value as "BOLD" | "CLEAN" })}>
                <SelectTrigger>
                  <SelectValue placeholder="Caption style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLD">Bold</SelectItem>
                  <SelectItem value="CLEAN">Clean</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={saveCrop}>Save crop</Button>
              <Button variant="ghost" onClick={resetCrop}>Reset</Button>
              <Button onClick={generate}><WandSparkles className="mr-2 h-4 w-4" />Generate clips</Button>
            </div>
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            {status === "FAILED" && jobError ? (
              <p className="text-sm text-destructive">Processing failed: {jobError}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Processing state</CardTitle>
            <CardDescription>Pipeline steps update while the worker runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progressValue} />
            {status === "PROCESSING" ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Current step: {stageLabel(processingStage) || "Processing"}</p>
                {processingNote ? <p>{processingNote}</p> : null}
                {refreshing ? <p>Refreshing status...</p> : null}
              </div>
            ) : null}
            <ul className="space-y-2">
              {processingSteps.map((step, idx) => (
                <li key={step} className="flex items-center justify-between text-sm">
                  <span>{step}</span>
                  <span className="text-muted-foreground">
                    {stepStates[idx] === "in_progress" ? "in progress" : stepStates[idx]}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Exports are available for 72h after completion.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>Download clips and copy metadata for manual posting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : null}

          {!loading && !clips.length ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">No clips yet. Start generation to produce exports.</p>
            </div>
          ) : null}

          {clips.map((clip) => (
            <div key={clip.clip_id} className="rounded-md border p-4">
              <div className="grid gap-4 md:grid-cols-[220px,1fr]">
                <video src={clip.clip_url} controls className="w-full rounded-md bg-muted" aria-label={`Preview ${clip.title}`} />
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold">{clip.title}</p>
                    <p className="text-sm text-muted-foreground">{clip.hook}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{clip.description}</p>
                  <p className="text-xs text-muted-foreground">Available for 72h</p>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <a href={clip.clip_url} target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />Download</a>
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => copyText(clip.title, "Title")}><Copy className="mr-2 h-4 w-4" />Copy title</Button>
                    <Button size="sm" variant="secondary" onClick={() => copyText(clip.hashtags.join(" "), "Hashtags")}><Copy className="mr-2 h-4 w-4" />Copy hashtags</Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
