"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Clip = {
  clip_id: string;
  clip_url: string;
  title: string;
  description: string;
  hashtags: string[];
  hook: string;
  reason: string;
  provider_metadata: Record<string, any>;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const niches = {
  dev: ["Debug this in 30s", "Stop this TS error", "One line that saves hours"],
  education: ["Explain this concept fast", "Common student mistake", "Memorize this rule"]
};

export function JobDetailClient({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState("loading");
  const [clips, setClips] = useState<Clip[]>([]);
  const [generateMsg, setGenerateMsg] = useState("");
  const [crop, setCrop] = useState({
    x: 0.72,
    y: 0.7,
    width: 0.26,
    height: 0.26,
    layout: "TOP_WEBCAM_BOTTOM_SCREEN",
    captionPreset: "BOLD"
  });

  const hashtagsLibrary = useMemo(
    () => ["#coding", "#tutorial", "#education", "#webdev", "#howto", "#shorts", "#learning"],
    []
  );

  async function load() {
    const res = await fetch(`/api/jobs/${jobId}/suggest`, { headers: await authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "error");
      return;
    }
    setStatus(data.job.status);
    setClips(data.exports || []);
    if (data.job.crop_config) setCrop(data.job.crop_config);
  }

  async function saveCrop() {
    await fetch(`/api/jobs/${jobId}/crop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(crop)
    });
    await load();
  }

  async function generate() {
    setGenerateMsg("Queueing job...");
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ status: "READY_TO_PROCESS" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setGenerateMsg(data.error || "Could not queue job.");
      return;
    }
    setGenerateMsg("Job queued for GitHub Actions worker.");
    await load();
  }

  function copyPack(clip: Clip) {
    const text = `${clip.title}\n\n${clip.description}\n\n${clip.hashtags.join(" ")}`;
    navigator.clipboard.writeText(text);
  }

  function shareUrl(platform: "youtube" | "tiktok" | "instagram" | "x", clip: Clip) {
    if (platform === "youtube") return `https://studio.youtube.com`;
    if (platform === "tiktok") return `https://www.tiktok.com/upload`;
    if (platform === "instagram") return `https://www.instagram.com`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${clip.title} ${clip.hashtags.join(" ")}`)}`;
  }

  useEffect(() => {
    load().catch(console.error);
    const t = setInterval(() => load().catch(console.error), 10000);
    return () => clearInterval(t);
  }, [jobId]);

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Job {jobId}</h2>
        <p className="text-sm text-muted">Status: {status}</p>
        <p className="text-sm text-muted">Layout template: Top webcam / Bottom screen</p>

        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-sm">x<input className="input mt-1" type="number" step="0.01" value={crop.x} onChange={(e) => setCrop({ ...crop, x: Number(e.target.value) })} /></label>
          <label className="text-sm">y<input className="input mt-1" type="number" step="0.01" value={crop.y} onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) })} /></label>
          <label className="text-sm">width<input className="input mt-1" type="number" step="0.01" value={crop.width} onChange={(e) => setCrop({ ...crop, width: Number(e.target.value) })} /></label>
          <label className="text-sm">height<input className="input mt-1" type="number" step="0.01" value={crop.height} onChange={(e) => setCrop({ ...crop, height: Number(e.target.value) })} /></label>
        </div>

        <label className="text-sm">
          Caption preset
          <select
            className="input mt-1"
            value={crop.captionPreset}
            onChange={(e) => setCrop({ ...crop, captionPreset: e.target.value as "BOLD" | "CLEAN" })}
          >
            <option value="BOLD">Bold</option>
            <option value="CLEAN">Clean</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={saveCrop}>
            Save crop config
          </button>
          <button className="btn-primary" onClick={generate}>
            Generate clips
          </button>
        </div>
        {generateMsg ? <p className="text-sm text-muted">{generateMsg}</p> : null}
      </section>

      <section className="card space-y-3">
        <h3 className="text-lg font-semibold">Content templates</h3>
        <p className="text-sm text-muted">Title hooks for dev tutors and educators:</p>
        <p className="text-sm">Dev: {niches.dev.join(" | ")}</p>
        <p className="text-sm">Education: {niches.education.join(" | ")}</p>
        <p className="text-sm">Hashtag set: {hashtagsLibrary.join(" ")}</p>
      </section>

      <section className="card space-y-3">
        <h3 className="text-lg font-semibold">Publish pack (manual posting)</h3>
        {clips.map((clip) => (
          <article key={clip.clip_id} className="rounded-xl border border-black/10 p-4">
            <p className="font-semibold">{clip.title}</p>
            <p className="mt-1 text-sm text-muted">{clip.hook}</p>
            <p className="mt-2 text-sm">{clip.description}</p>
            <p className="mt-2 text-sm text-muted">{clip.hashtags.join(" ")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="btn-secondary" href={clip.clip_url} target="_blank">Download MP4</a>
              <button className="btn-secondary" onClick={() => copyPack(clip)}>Copy metadata</button>
              <a className="btn-secondary" href={shareUrl("youtube", clip)} target="_blank">YouTube upload</a>
              <a className="btn-secondary" href={shareUrl("tiktok", clip)} target="_blank">TikTok upload</a>
              <a className="btn-secondary" href={shareUrl("instagram", clip)} target="_blank">Instagram upload</a>
              <a className="btn-secondary" href={shareUrl("x", clip)} target="_blank">X upload</a>
            </div>
          </article>
        ))}
        {!clips.length ? <p className="text-sm text-muted">Clips will appear after worker processing finishes.</p> : null}
      </section>
    </div>
  );
}
