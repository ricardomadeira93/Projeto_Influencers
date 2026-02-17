"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase-browser";

type UploadWidgetProps = {
  onUploaded: () => Promise<void> | void;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function UploadWidget({ onUploaded }: UploadWidgetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState(600);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  async function handleUpload() {
    if (!file || uploading) return;

    setUploading(true);
    setProgress(10);
    setMessage("Preparing upload...");

    try {
      const sign = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ filename: file.name, durationSec })
      });
      const signData = await sign.json();
      if (!sign.ok) throw new Error(signData.error || "Could not sign upload");

      setMessage("Uploading video...");
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      await new Promise<void>((resolve, reject) => {
        xhr.open("PUT", signData.signedUrl);
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.min(95, Math.round((e.loaded / e.total) * 90) + 5);
            setProgress(pct);
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

      await fetch(`/api/jobs/${signData.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ status: "UPLOADED" })
      });

      setProgress(100);
      setMessage("Upload complete. Open the job and click Generate.");
      setFile(null);
      await onUploaded();
    } catch (err: any) {
      setMessage(err.message || "Upload failed");
    } finally {
      setUploading(false);
      xhrRef.current = null;
    }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
    setUploading(false);
    setMessage("Upload cancelled.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New video</CardTitle>
        <CardDescription>Upload one tutorial recording to start generating clips.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            "rounded-lg border border-dashed p-6 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Drag and drop your video</p>
          <p className="text-xs text-muted-foreground">MP4 recommended. Free plan supports up to 60 total minutes.</p>
          <div className="mt-3">
            <Input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              aria-label="Choose video file"
            />
          </div>
        </div>

        {file ? <p className="text-sm">Selected: <span className="text-muted-foreground">{file.name}</span></p> : null}

        <div className="space-y-2">
          <Label htmlFor="durationSec">Estimated duration (seconds)</Label>
          <Input
            id="durationSec"
            type="number"
            min={1}
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value || 1))}
          />
          <p className="text-xs text-muted-foreground">Constraint: max upload duration is controlled by server policy.</p>
        </div>

        {uploading ? <Progress value={progress} aria-label="Upload progress" /> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleUpload} disabled={!file || uploading}>Upload video</Button>
          {uploading ? (
            <Button type="button" variant="secondary" onClick={cancelUpload}>
              <X className="mr-1 h-4 w-4" /> Cancel
            </Button>
          ) : null}
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
