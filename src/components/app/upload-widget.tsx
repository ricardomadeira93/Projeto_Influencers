"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Sparkles, Upload, X } from "lucide-react";
import { FormSection } from "@/components/app/form-section";
import { PrimaryButton, SecondaryButton } from "@/components/app/action-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { DEFAULT_GENERATION_CONFIG, type ClipGenre, type ClipLengthPreset, type ClipStyle, type GenerationConfig } from "@/lib/types";
import { useLanguage } from "@/components/app/language-provider";

type UploadWidgetProps = {
  onUploaded: () => Promise<void> | void;
};

type Template = {
  id: string;
  name: string;
  config: Omit<GenerationConfig, "templateId">;
  created_at: string;
};

const CLIP_STYLES: ClipStyle[] = ["Balanced", "Hooky", "Educational", "Story"];
const GENRES: ClipGenre[] = ["Tutorial", "Podcast", "Talking Head", "Interview", "Demo", "Other"];
const CLIP_COUNT_OPTIONS = Array.from({ length: 10 }, (_v, i) => i + 1);
const LENGTH_PRESETS: ClipLengthPreset[] = [30, 60, 90, 180];
const CLIP_STYLE_LABELS: Record<ClipStyle, string> = {
  Balanced: "Balanceado",
  Hooky: "Gancho forte",
  Educational: "Educacional",
  Story: "Narrativo"
};
const GENRE_LABELS: Record<ClipGenre, string> = {
  Tutorial: "Tutorial",
  Podcast: "Podcast",
  "Talking Head": "Falando para câmera",
  Interview: "Entrevista",
  Demo: "Demonstração",
  Other: "Outro"
};

const BUILT_IN_PRESETS: Array<{
  id: string;
  label: string;
  config: Partial<GenerationConfig>;
}> = [
  {
    id: "balanced_default",
    label: "Balanceado padrão",
    config: { clipStyle: "Balanced", genre: "Tutorial", clipCount: 4, clipLengthMaxS: 60, autoHook: false }
  },
  {
    id: "hook_boost",
    label: "Gancho forte",
    config: { clipStyle: "Hooky", genre: "Podcast", clipCount: 5, clipLengthMaxS: 30, autoHook: true }
  },
  {
    id: "edu_explainer",
    label: "Explicativo educacional",
    config: { clipStyle: "Educational", genre: "Tutorial", clipCount: 4, clipLengthMaxS: 90, autoHook: false }
  },
  {
    id: "story_flow",
    label: "Fluxo narrativo",
    config: { clipStyle: "Story", genre: "Interview", clipCount: 3, clipLengthMaxS: 60, autoHook: true }
  }
];

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

function parseTimecode(input: string) {
  const value = input.trim();
  if (!value) return null;
  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 1) return Math.round(parts[0]);
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return null;
}

function formatTimecode(input: number | null) {
  if (input === null || !Number.isFinite(input)) return "";
  const total = Math.max(0, Math.round(input));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function durationLabel(durationSec: number | null) {
  if (!durationSec) return "00:00";
  return formatTimecode(durationSec);
}

function uploadErrorHint(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("413") || normalized.includes("maximum size exceeded") || normalized.includes("payload too large")) {
    return "Arquivo muito grande para o storage remoto. Para testes locais, o app usa upload local automático em arquivos grandes. Tente novamente.";
  }
  if (normalized.includes("max_upload_duration")) {
    return "Este vídeo é maior que o limite do seu plano. Corte ou envie um arquivo menor.";
  }
  if (normalized.includes("insufficient minutes")) {
    return "Você atingiu os minutos de processamento do plano. Tente um vídeo menor ou faça upgrade.";
  }
  return message;
}

export function UploadWidget({ onUploaded }: UploadWidgetProps) {
  const { tr } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [durationDetected, setDurationDetected] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [generationConfig, setGenerationConfig] = useState<GenerationConfig>(DEFAULT_GENERATION_CONFIG);
  const [timeframeStartInput, setTimeframeStartInput] = useState("");
  const [timeframeEndInput, setTimeframeEndInput] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [completedFile, setCompletedFile] = useState<{
    name: string;
    durationSec: number | null;
    previewUrl: string;
  } | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const uploadStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadTemplates() {
      setTemplatesLoading(true);
      try {
        const res = await fetch("/api/templates", { headers: await authHeaders(), cache: "no-store" });
        const data = await readJsonSafe(res);
        if (!mounted) return;
        if (!res.ok) return;
        if (data.templatesDisabled && typeof data.warning === "string") {
          setMessage(data.warning);
        }
        setTemplates((data.templates || []) as Template[]);
      } finally {
        if (mounted) setTemplatesLoading(false);
      }
    }
    loadTemplates().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
    setErrorMessage("");
    setMessage("");
    setCompletedFile(null);
    setFile(nextFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(nextFile));
    await detectDuration(nextFile);
  }

  function buildConfigPayload(status: "UPLOADED" | "READY_TO_PROCESS") {
    const timeframeStartS = parseTimecode(timeframeStartInput);
    const timeframeEndS = parseTimecode(timeframeEndInput);
    return {
      status,
      clipStyle: generationConfig.clipStyle,
      genre: generationConfig.genre,
      clipCount: generationConfig.clipCount,
      clipLengthMaxS: generationConfig.clipLengthMaxS,
      autoHook: generationConfig.autoHook,
      includeMomentText: generationConfig.includeMomentText.trim(),
      timeframeStartS,
      timeframeEndS,
      presetId: generationConfig.presetId,
      templateId: generationConfig.templateId
    };
  }

  async function patchJobConfig(jobId: string, status: "UPLOADED" | "READY_TO_PROCESS") {
    const payload = buildConfigPayload(status);
    const timeframeStartS = payload.timeframeStartS;
    const timeframeEndS = payload.timeframeEndS;
    if (timeframeStartS !== null && timeframeEndS !== null && timeframeEndS <= timeframeStartS) {
      throw new Error("O fim do recorte deve ser maior que o início.");
    }
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error((data.error as string) || "Não foi possível atualizar as configurações do job.");
  }

  async function uploadLargeFileLocally(inputFile: File, inputDurationSec: number | null) {
    const form = new FormData();
    form.append("file", inputFile);
    form.append("filename", inputFile.name);
    form.append("durationSec", String(inputDurationSec || 0));

    const headers = await authHeaders();
    return new Promise<{ jobId: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", "/api/upload/local");
      if (headers.Authorization) {
        xhr.setRequestHeader("Authorization", headers.Authorization);
      }
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const pct = Math.min(90, Math.max(5, Math.round((event.loaded / event.total) * 85)));
        setProgress(pct);
      };
      xhr.onerror = () => reject(new Error(tr("upload.uploadFailed")));
      xhr.onload = () => {
        const raw = xhr.responseText || "{}";
        let parsed: Record<string, any> = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {};
        }
        if (xhr.status >= 200 && xhr.status < 300 && typeof parsed.jobId === "string") {
          resolve({ jobId: parsed.jobId });
          return;
        }
        reject(new Error(String(parsed.error || `${tr("upload.uploadFailed")} (${xhr.status})`)));
      };
      xhr.send(form);
    });
  }

  async function handleUploadAndGenerate() {
    if (!file || uploading) return;

    setUploading(true);
    setProgress(5);
    setEtaSec(null);
    setErrorMessage("");
    setMessage("Preparando upload...");
    uploadStartedAtRef.current = Date.now();

    try {
      const LARGE_FILE_THRESHOLD_BYTES = 50 * 1024 * 1024;
      let jobId = "";

      if (file.size > LARGE_FILE_THRESHOLD_BYTES) {
        setMessage("Arquivo acima de 50MB detectado. Comprimindo para ~50MB e enviando...");
        const local = await uploadLargeFileLocally(file, durationSec);
        jobId = local.jobId;
        setProgress(92);
      } else {
        const sign = await fetch("/api/upload/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ filename: file.name, durationSec })
        });
        const signData = await readJsonSafe(sign);
        if (!sign.ok) throw new Error((signData.error as string) || tr("upload.signError"));

        jobId = String(signData.jobId || "");
        if (!jobId) throw new Error("Falha ao iniciar job de upload.");
        setMessage("Enviando vídeo de origem...");
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        await new Promise<void>((resolve, reject) => {
          xhr.open("PUT", signData.signedUrl);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const pct = Math.min(95, Math.round((event.loaded / event.total) * 90) + 5);
            setProgress(pct);
            const startedAt = uploadStartedAtRef.current;
            if (!startedAt) return;
            const elapsedSec = (Date.now() - startedAt) / 1000;
            if (elapsedSec <= 0 || event.loaded <= 0) return;
            const bytesPerSec = event.loaded / elapsedSec;
            if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return;
            const remaining = Math.max(0, event.total - event.loaded);
            setEtaSec(Math.round(remaining / bytesPerSec));
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`${tr("upload.uploadFailed")} (${xhr.status}): ${xhr.responseText || tr("upload.unknownError")}`));
          xhr.onerror = () => reject(new Error(tr("upload.uploadFailed")));
          xhr.send(file);
        });
      }

      setMessage("Aplicando configurações dos clipes...");
      await patchJobConfig(jobId, "UPLOADED");

      setMessage("Iniciando curadoria por IA...");
      await patchJobConfig(jobId, "READY_TO_PROCESS");

      setProgress(100);
      setMessage("Upload concluído. Seu vídeo já está em processamento.");
      setCompletedFile({
        name: file.name,
        durationSec,
        previewUrl
      });
      setFile(null);
      setDurationSec(null);
      setDurationDetected(false);
      await onUploaded();
    } catch (err: any) {
      setErrorMessage(uploadErrorHint(err.message || tr("upload.uploadFailed")));
      setMessage("");
    } finally {
      setUploading(false);
      xhrRef.current = null;
      uploadStartedAtRef.current = null;
    }
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    setErrorMessage("");
    try {
      const timeframeStartS = parseTimecode(timeframeStartInput);
      const timeframeEndS = parseTimecode(timeframeEndInput);
      if (timeframeStartS !== null && timeframeEndS !== null && timeframeEndS <= timeframeStartS) {
        throw new Error("O fim do recorte deve ser maior que o início.");
      }
      const body = {
        name: saveTemplateName.trim() || `${CLIP_STYLE_LABELS[generationConfig.clipStyle]} modelo`,
        config: {
          clipStyle: generationConfig.clipStyle,
          genre: generationConfig.genre,
          clipCount: generationConfig.clipCount,
          clipLengthMaxS: generationConfig.clipLengthMaxS,
          autoHook: generationConfig.autoHook,
          includeMomentText: generationConfig.includeMomentText.trim(),
          timeframeStartS,
          timeframeEndS,
          presetId: generationConfig.presetId
        }
      };
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(body)
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error((data.error as string) || "Não foi possível salvar o template.");
      const saved = data.template as Template;
      setTemplates((prev) => [saved, ...prev]);
      setSaveTemplateName("");
      setGenerationConfig((prev) => ({ ...prev, templateId: saved.id }));
      setMessage("Template salvo.");
    } catch (err: any) {
      setErrorMessage(err.message || "Não foi possível salvar o template.");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    setDeletingTemplateId(templateId);
    setErrorMessage("");
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
        headers: await authHeaders()
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error((data.error as string) || "Não foi possível excluir o template.");
      setTemplates((prev) => prev.filter((template) => template.id !== templateId));
      setGenerationConfig((prev) => ({
        ...prev,
        templateId: prev.templateId === templateId ? null : prev.templateId
      }));
      setMessage("Template excluído.");
    } catch (err: any) {
      setErrorMessage(err.message || "Não foi possível excluir o template.");
    } finally {
      setDeletingTemplateId(null);
    }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
    setUploading(false);
    setMessage(tr("upload.cancelled"));
  }

  function applyPreset(id: string) {
    const preset = BUILT_IN_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setGenerationConfig((prev) => ({
      ...prev,
      ...preset.config,
      presetId: preset.id,
      templateId: null
    }));
  }

  function applyTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setGenerationConfig((prev) => ({
      ...prev,
      ...template.config,
      clipCount:
        typeof (template.config as Partial<GenerationConfig>).clipCount === "number"
          ? Math.max(1, Math.min(10, Number((template.config as Partial<GenerationConfig>).clipCount) || prev.clipCount))
          : prev.clipCount,
      templateId: template.id,
      presetId: template.config.presetId || null
    }));
    setTimeframeStartInput(formatTimecode(template.config.timeframeStartS));
    setTimeframeEndInput(formatTimecode(template.config.timeframeEndS));
  }

  const selectedLengthLabel = useMemo(() => `0-${generationConfig.clipLengthMaxS}s`, [generationConfig.clipLengthMaxS]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
        <Card className="hover-lift rounded-xl border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>{tr("upload.title")}</CardTitle>
            <CardDescription>{tr("upload.body")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                "rounded-xl border border-dashed p-6 text-center transition-colors",
                "bg-gradient-to-b from-muted/50 to-background",
                dragging ? "border-primary bg-primary/5" : "border-border"
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) {
                  setFileAndDuration(dropped).catch(() => undefined);
                }
              }}
            >
              {!file && !completedFile ? (
                <>
                  <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="mt-3 text-base font-semibold">{tr("upload.dropTitle")}</p>
                  <p className="text-sm text-muted-foreground">{tr("upload.dropBody")}</p>
                </>
              ) : null}

              {file ? (
                <div className="space-y-3 text-left">
                  <div className="overflow-hidden rounded-lg border bg-black/80">
                    <video src={previewUrl} muted playsInline className="h-44 w-full object-cover" />
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-muted-foreground">{durationLabel(durationSec)}</p>
                  </div>
                </div>
              ) : null}

              {!file && completedFile ? (
                <div className="space-y-3 text-left">
                  <div className="overflow-hidden rounded-lg border bg-black/80">
                    <video src={completedFile.previewUrl} muted playsInline className="h-44 w-full object-cover" />
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p className="font-medium">{completedFile.name}</p>
                    <p className="text-muted-foreground">{durationLabel(completedFile.durationSec)}</p>
                  </div>
                </div>
              ) : null}

              <div className="mt-4">
                <Input
                  type="file"
                  accept="video/*"
                  onChange={(event) => {
                    const selectedFile = event.target.files?.[0];
                    if (!selectedFile) return;
                    setFileAndDuration(selectedFile).catch(() => undefined);
                  }}
                  aria-label={tr("upload.fileInputAria")}
                />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="font-medium">{tr("upload.detectedDuration")}</p>
              <p className="mt-1 text-muted-foreground">
                {durationDetected && durationSec ? `${durationSec}s ${tr("upload.detectedFormat")}` : tr("upload.detecting")}
              </p>
              {!durationDetected ? <p className="mt-1 text-xs text-muted-foreground">{tr("upload.detectingHelp")}</p> : null}
            </div>

            {uploading ? (
              <div className="space-y-2">
                <Progress value={progress} aria-label={tr("upload.progressAria")} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progress}%</span>
                  <span>{etaSec !== null ? `~${formatTimecode(etaSec)} restantes` : "estimando..."}</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="hover-lift rounded-xl border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Configurações dos clipes
            </CardTitle>
            <CardDescription>Defina como a IA deve curar seus clipes antes do processamento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <FormSection title="Estilo do clipe" helper="Escolha o comportamento da curadoria.">
              <div className="grid grid-cols-2 gap-2">
                {CLIP_STYLES.map((style) => (
                  <Button
                    key={style}
                    type="button"
                    variant={generationConfig.clipStyle === style ? "default" : "outline"}
                    className="justify-center"
                    onClick={() => setGenerationConfig((prev) => ({ ...prev, clipStyle: style }))}
                  >
                    {CLIP_STYLE_LABELS[style]}
                  </Button>
                ))}
              </div>
            </FormSection>

            <FormSection title="Gênero">
              <Select
                value={generationConfig.genre}
                onValueChange={(value) => setGenerationConfig((prev) => ({ ...prev, genre: value as ClipGenre }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o gênero" />
                </SelectTrigger>
                <SelectContent>
                  {GENRES.map((genre) => (
                    <SelectItem key={genre} value={genre}>
                      {GENRE_LABELS[genre]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormSection>

            <FormSection title="Quantidade de clipes" helper="Escolha entre 1 e 10 clipes.">
              <Select
                value={String(generationConfig.clipCount)}
                onValueChange={(value) =>
                  setGenerationConfig((prev) => ({ ...prev, clipCount: Math.max(1, Math.min(10, Number(value) || 4)) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a quantidade" />
                </SelectTrigger>
                <SelectContent>
                  {CLIP_COUNT_OPTIONS.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count} clipe{count > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormSection>

            <FormSection title="Duração do clipe" helper={`Selecionado: ${selectedLengthLabel}`}>
              <div className="flex flex-wrap gap-2">
                {LENGTH_PRESETS.map((length) => (
                  <Button
                    key={length}
                    type="button"
                    size="sm"
                    variant={generationConfig.clipLengthMaxS === length ? "default" : "outline"}
                    className="rounded-full px-4"
                    onClick={() => setGenerationConfig((prev) => ({ ...prev, clipLengthMaxS: length }))}
                  >
                    0-{length}s
                  </Button>
                ))}
              </div>
            </FormSection>

            <FormSection title="Auto Hook" helper="Prioriza ranking e metadados com foco em gancho.">
              <button
                type="button"
                className={cn(
                  "inline-flex h-10 w-full items-center justify-between rounded-lg border px-3 text-sm",
                  generationConfig.autoHook ? "border-primary bg-primary/5" : "border-border bg-background"
                )}
                onClick={() => setGenerationConfig((prev) => ({ ...prev, autoHook: !prev.autoHook }))}
              >
                <span>{generationConfig.autoHook ? "Ativado" : "Desativado"}</span>
                <span
                  className={cn(
                    "h-5 w-9 rounded-full p-0.5 transition-colors",
                    generationConfig.autoHook ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-full bg-white transition-transform",
                      generationConfig.autoHook ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </span>
              </button>
            </FormSection>

            <FormSection title="Incluir momento específico" helper="Opcional. Exemplo: “seção de preços”">
              <Textarea
                value={generationConfig.includeMomentText}
                onChange={(event) =>
                  setGenerationConfig((prev) => ({
                    ...prev,
                    includeMomentText: event.target.value.slice(0, 300)
                  }))
                }
                placeholder="Descreva o momento que você quer incluir"
                className="min-h-[84px]"
              />
            </FormSection>

            <FormSection title="Faixa de tempo" helper="Use mm:ss ou hh:mm:ss. Deixe em branco para vídeo completo.">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="timeframe-start-input">De</Label>
                  <Input
                    id="timeframe-start-input"
                    placeholder="00:00"
                    value={timeframeStartInput}
                    onChange={(event) => setTimeframeStartInput(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="timeframe-end-input">Até</Label>
                  <Input
                    id="timeframe-end-input"
                    placeholder="00:00"
                    value={timeframeEndInput}
                    onChange={(event) => setTimeframeEndInput(event.target.value)}
                  />
                </div>
              </div>
            </FormSection>

            <FormSection title="Presets e templates">
              <div className="space-y-2">
                <Select
                  value={generationConfig.presetId || "no-preset"}
                  onValueChange={(value) => {
                    if (value === "no-preset") {
                      setGenerationConfig((prev) => ({ ...prev, presetId: null }));
                      return;
                    }
                    applyPreset(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Preset nativo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-preset">Sem preset</SelectItem>
                    {BUILT_IN_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={generationConfig.templateId || "no-template"}
                  onValueChange={(value) => {
                    if (value === "no-template") {
                      setGenerationConfig((prev) => ({ ...prev, templateId: null }));
                      return;
                    }
                    applyTemplate(value);
                  }}
                  disabled={templatesLoading || !templates.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={templatesLoading ? "Carregando templates..." : "Template do usuário"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no-template">Sem template</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Nome do template (opcional)"
                  value={saveTemplateName}
                  onChange={(event) => setSaveTemplateName(event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!generationConfig.templateId || deletingTemplateId !== null}
                  onClick={() => generationConfig.templateId && deleteTemplate(generationConfig.templateId)}
                >
                  {deletingTemplateId ? "Excluindo template..." : "Excluir template selecionado"}
                </Button>
              </div>
            </FormSection>
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-3 z-20 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4" />
            <span>{uploading ? "Enviando e iniciando IA..." : "Pronto para gerar clipes"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton type="button" onClick={saveTemplate} disabled={savingTemplate || uploading}>
              {savingTemplate ? "Salvando..." : "Salvar template"}
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={handleUploadAndGenerate}
              disabled={!file || uploading || !durationSec || !durationDetected}
            >
              {uploading ? "Enviando..." : "Gerar clipes"}
            </PrimaryButton>
            {uploading ? (
              <Button type="button" variant="ghost" onClick={cancelUpload}>
                <X className="mr-1 h-4 w-4" /> {tr("upload.cancel")}
              </Button>
            ) : null}
          </div>
        </div>
        {errorMessage ? (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}
