"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useLanguage } from "@/components/app/language-provider";

type UploadWidgetProps = {
  onUploaded: () => Promise<void> | void;
};

async function readJsonSafe(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  if (!raw) return {};
  if (!contentType.includes("application/json")) {
    return { error: `Resposta inválida do servidor (${response.status}).` };
  }
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return { error: `Resposta JSON inválida do servidor (${response.status}).` };
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function UploadWidget({ onUploaded }: UploadWidgetProps) {
  const { tr } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [durationDetected, setDurationDetected] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  async function detectDuration(inputFile: File) {
    const objectUrl = URL.createObjectURL(inputFile);
    try {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = objectUrl;
      const duration = await new Promise<number>((resolve, reject) => {
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject(new Error(tr("upload.metadataError")));
      });
      const seconds = Math.max(1, Math.round(duration));
      setDurationSec(seconds);
      setDurationDetected(true);
    } catch {
      setDurationSec(600);
      setDurationDetected(false);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function setFileAndDuration(nextFile: File) {
    setFile(nextFile);
    await detectDuration(nextFile);
  }

  async function handleUpload() {
    if (!file || uploading) return;

    setUploading(true);
    setProgress(10);
    setMessage(tr("upload.preparing"));

    try {
      const sign = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ filename: file.name, durationSec })
      });
      const signData = await readJsonSafe(sign);
      if (!sign.ok) throw new Error(signData.error || tr("upload.signError"));

      setMessage(tr("upload.uploading"));
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
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`${tr("upload.uploadFailed")} (${xhr.status}): ${xhr.responseText || tr("upload.unknownError")}`));
        xhr.onerror = () => reject(new Error(tr("upload.uploadFailed")));
        xhr.send(file);
      });

      const markUploaded = await fetch(`/api/jobs/${signData.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ status: "UPLOADED" }),
        cache: "no-store"
      });
      const markUploadedData = await readJsonSafe(markUploaded);
      if (!markUploaded.ok) {
        throw new Error(markUploadedData.error || tr("upload.statusUpdateError"));
      }

      setProgress(100);
      setMessage(tr("upload.complete"));
      setFile(null);
      await onUploaded();
    } catch (err: any) {
      setMessage(err.message || tr("upload.uploadFailed"));
    } finally {
      setUploading(false);
      xhrRef.current = null;
    }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
    setUploading(false);
    setMessage(tr("upload.cancelled"));
  }

  return (
    <Card>
        <CardHeader>
        <CardTitle>{tr("upload.title")}</CardTitle>
        <CardDescription>{tr("upload.body")}</CardDescription>
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
            if (dropped) {
              setFileAndDuration(dropped).catch(() => undefined);
            }
          }}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">{tr("upload.dropTitle")}</p>
          <p className="text-xs text-muted-foreground">{tr("upload.dropBody")}</p>
          <div className="mt-3">
            <Input
              type="file"
              accept="video/*"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) {
                  setFileAndDuration(selectedFile).catch(() => undefined);
                } else {
                  setFile(null);
                  setDurationSec(null);
                }
              }}
              aria-label={tr("upload.fileInputAria")}
            />
          </div>
        </div>

        {file ? <p className="text-sm">{tr("upload.selected")} <span className="text-muted-foreground">{file.name}</span></p> : null}

        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">{tr("upload.detectedDuration")}</p>
          <p className="mt-1 text-muted-foreground">
            {durationDetected && durationSec
              ? `${durationSec}s ${tr("upload.detectedFormat")}`
              : tr("upload.detecting")}
          </p>
          {!durationDetected ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {tr("upload.detectingHelp")}
            </p>
          ) : null}
        </div>

        {uploading ? <Progress value={progress} aria-label={tr("upload.progressAria")} /> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleUpload} disabled={!file || uploading || !durationSec || !durationDetected}>
            {tr("upload.uploadVideo")}
          </Button>
          {uploading ? (
            <Button type="button" variant="secondary" onClick={cancelUpload}>
              <X className="mr-1 h-4 w-4" /> {tr("upload.cancel")}
            </Button>
          ) : null}
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
