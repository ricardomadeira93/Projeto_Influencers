"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { FeedbackModal } from "@/components/feedback-modal";

type JobListItem = {
  id: string;
  status: string;
  source_filename: string;
  created_at: string;
  expires_at: string;
};

async function authHeaders() {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function DashboardClient() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [message, setMessage] = useState("");
  const [durationSec, setDurationSec] = useState(600);
  const [file, setFile] = useState<File | null>(null);

  const remainingLabel = useMemo(
    () => "Free plan: 60 lifetime minutes (tracked server-side).",
    []
  );

  async function loadJobs() {
    const res = await fetch("/api/jobs", { headers: await authHeaders() });
    const data = await res.json();
    if (res.ok) setJobs(data.jobs || []);
  }

  async function upload() {
    if (!file) return;
    setMessage("Requesting signed upload URL...");

    const sign = await fetch("/api/upload/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ filename: file.name, durationSec })
    });

    const signData = await sign.json();
    if (!sign.ok) {
      setMessage(signData.error || "Could not sign upload");
      return;
    }

    const putRes = await fetch(signData.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "video/mp4" },
      body: file
    });

    if (!putRes.ok) {
      setMessage("Upload failed");
      await fetch(`/api/jobs/${signData.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ status: "FAILED" })
      });
      return;
    }

    await fetch(`/api/jobs/${signData.jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ status: "UPLOADED" })
    });

    setMessage("Upload complete. Job queued.");
    setFile(null);
    await loadJobs();
  }

  useEffect(() => {
    loadJobs().catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create a job</h2>
          <FeedbackModal />
        </div>
        <p className="text-sm text-muted">{remainingLabel}</p>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="input"
        />
        <label className="text-sm">
          Estimated duration (seconds)
          <input
            className="input mt-1"
            type="number"
            min={1}
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value || 1))}
          />
        </label>
        <button className="btn-primary" onClick={upload} disabled={!file}>
          Upload and queue
        </button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </section>

      <section className="card">
        <h3 className="text-lg font-semibold">Jobs</h3>
        <div className="mt-3 space-y-2">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              className="flex items-center justify-between rounded-xl border border-black/10 p-3 hover:bg-black/5"
            >
              <div>
                <p className="font-medium">{job.source_filename}</p>
                <p className="text-xs text-muted">{new Date(job.created_at).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{job.status}</p>
                <p className="text-xs text-muted">expires {new Date(job.expires_at).toLocaleString()}</p>
              </div>
            </Link>
          ))}
          {!jobs.length ? <p className="text-sm text-muted">No jobs yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
