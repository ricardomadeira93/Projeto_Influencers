"use client";

import { useEffect, useMemo, useState } from "react";
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

const processingSteps = ["Transcribing", "Selecting clips", "Rendering exports"];

export function JobScreen({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState("loading");
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [crop, setCrop] = useState({
    x: 0.72,
    y: 0.7,
    width: 0.26,
    height: 0.26,
    layout: "TOP_WEBCAM_BOTTOM_SCREEN",
    captionPreset: "BOLD"
  });

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/jobs/${jobId}/suggest`, { headers: await authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "error");
      setLoading(false);
      return;
    }
    setStatus(data.job.status);
    setClips(data.exports || []);
    if (data.job.crop_config) setCrop(data.job.crop_config);
    setLoading(false);
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
    setMessage("Queueing job...");
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ status: "READY_TO_PROCESS" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "Could not queue job");
      toast.error(data.error || "Could not queue job");
      return;
    }
    setMessage("Job queued for processing.");
    toast.success("Job queued");
    await load();
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  useEffect(() => {
    load().catch(console.error);
    const t = setInterval(() => load().catch(console.error), 10000);
    return () => clearInterval(t);
  }, [jobId]);

  const activeStep = useMemo(() => {
    if (status === "PROCESSING") return 2;
    if (status === "DONE") return 3;
    return 1;
  }, [status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Job workspace</h1>
          <p className="text-sm text-muted-foreground">Configure crop, start processing, and collect exports.</p>
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
            <div className="rounded-lg border bg-muted/30 p-6">
              <p className="text-sm text-muted-foreground">Preview placeholder</p>
              <p className="mt-2 text-xs text-muted-foreground">Live crop preview can be plugged here later.</p>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Processing state</CardTitle>
            <CardDescription>Pipeline steps update while the worker runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={(activeStep / processingSteps.length) * 100} />
            <ul className="space-y-2">
              {processingSteps.map((step, idx) => (
                <li key={step} className="flex items-center justify-between text-sm">
                  <span>{step}</span>
                  <span className="text-muted-foreground">{idx + 1 <= activeStep ? "done" : "pending"}</span>
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
