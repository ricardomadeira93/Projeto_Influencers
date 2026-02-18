"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Captions, Clapperboard, Film, Search, Sparkles, SquareDashed, Trash2, WandSparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { UploadWidget } from "@/components/app/upload-widget";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SkeletonList } from "@/components/app/skeletons";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/components/app/language-provider";

type JobListItem = {
  id: string;
  status: string;
  source_filename: string;
  preview_url?: string;
  created_at: string;
  expires_at: string;
  processing_stage?: string | null;
  processing_progress?: number | null;
  processing_note?: string | null;
};

function stageLabel(stage?: string | null) {
  if (!stage) return "Processando";
  const labels: Record<string, string> = {
    QUEUED: "Na fila",
    DOWNLOADING_SOURCE: "Baixando fonte",
    EXTRACTING_AUDIO: "Extraindo áudio",
    TRANSCRIBING: "Transcrevendo",
    SELECTING_CLIPS: "Selecionando clipes",
    RENDERING_EXPORTS: "Renderizando clipes",
    UPLOADING_EXPORTS: "Salvando exports",
    FINALIZING: "Finalizando"
  };
  return labels[stage] || stage.toLowerCase().replace(/_/g, " ");
}

async function readJsonSafe(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  if (!raw) return {};
  if (!contentType.includes("application/json")) return {};
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return {};
  }
}

type ToolAction = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  comingSoon?: boolean;
};

const TOOL_ACTIONS: ToolAction[] = [
  { key: "long-to-shorts", label: "Longo -> Shorts", icon: Film },
  { key: "ai-captions", label: "IA Legendas", icon: Captions },
  { key: "video-editor", label: "Editor de vídeo", icon: Clapperboard },
  { key: "ai-reframe", label: "IA Reframe", icon: SquareDashed },
  { key: "ai-hook", label: "IA Hook", icon: WandSparkles, comingSoon: true },
  { key: "enhance-speech", label: "Melhorar voz", icon: Sparkles, comingSoon: true },
  { key: "ai-broll", label: "IA B-roll", icon: Film, comingSoon: true }
];

export function DashboardScreen() {
  const { tr } = useLanguage();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [cardActionState, setCardActionState] = useState<{ jobId: string; action: "download" | "copy" | "delete" } | null>(null);

  async function loadJobs(tokenOverride?: string | null, options?: { silent?: boolean }) {
    const token = tokenOverride ?? accessToken;
    if (!options?.silent) setLoading(true);
    if (!token) {
      setIsAuthenticated(false);
      setJobs([]);
      if (!options?.silent) setLoading(false);
      return;
    }
    const res = await fetch("/api/jobs", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 401) {
      setIsAuthenticated(false);
      setAccessToken(null);
      setJobs([]);
      if (!options?.silent) setLoading(false);
      return;
    }
    const data = await readJsonSafe(res);
    if (res.ok) setJobs((data.jobs || []) as JobListItem[]);
    if (!options?.silent) setLoading(false);
  }

  useEffect(() => {
    let isMounted = true;
    const unblockTimer = setTimeout(() => {
      if (isMounted) setSessionLoading(false);
    }, 1200);

    supabaseBrowser.auth
      .getSession()
      .then(async ({ data }) => {
        if (!isMounted) return;
        const token = data.session?.access_token ?? null;
        setAccessToken(token);
        setIsAuthenticated(Boolean(token));
        setUserId(data.session?.user?.id ?? null);
        if (token) {
          await loadJobs(token);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setAccessToken(null);
        setUserId(null);
        setIsAuthenticated(false);
        setLoading(false);
      })
      .finally(() => {
        clearTimeout(unblockTimer);
        if (isMounted) setSessionLoading(false);
      });

    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      const token = session?.access_token ?? null;
      setAccessToken(token);
      setIsAuthenticated(Boolean(token));
      setUserId(session?.user?.id ?? null);
      if (token) {
        await loadJobs(token);
      } else {
        setJobs([]);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(unblockTimer);
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    const channel = supabaseBrowser
      .channel(`dashboard-jobs-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `user_id=eq.${userId}` }, (payload) => {
        const eventType = payload.eventType;
        const row = ((eventType === "DELETE" ? payload.old : payload.new) || {}) as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id : "";
        if (!id) return;

        if (eventType === "DELETE") {
          setJobs((prev) => prev.filter((job) => job.id !== id));
          return;
        }

        setJobs((prev) => {
          const index = prev.findIndex((job) => job.id === id);
          const patch = {
            id,
            status: typeof row.status === "string" ? row.status : "PENDING",
            source_filename: typeof row.source_filename === "string" ? row.source_filename : "",
            created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
            expires_at: typeof row.expires_at === "string" ? row.expires_at : new Date().toISOString(),
            preview_url: index >= 0 ? prev[index].preview_url : "",
            processing_stage: typeof row.processing_stage === "string" || row.processing_stage === null ? (row.processing_stage as string | null) : null,
            processing_progress: typeof row.processing_progress === "number" ? row.processing_progress : null,
            processing_note: typeof row.processing_note === "string" || row.processing_note === null ? (row.processing_note as string | null) : null
          } satisfies JobListItem;

          if (index === -1) return [patch, ...prev];
          const next = [...prev];
          next[index] = { ...next[index], ...patch };
          return next;
        });
      })
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [isAuthenticated, userId]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    const hasActiveJob = jobs.some((job) => job.status === "PROCESSING" || job.status === "READY_TO_PROCESS");
    if (!hasActiveJob) return;

    const timer = setInterval(() => {
      if (document.hidden) return;
      loadJobs(accessToken, { silent: true }).catch(() => undefined);
    }, 5000);

    return () => clearInterval(timer);
  }, [accessToken, isAuthenticated, jobs]);

  async function signInWithPassword() {
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    setAuthMessage(tr("dashboard.signedIn"));
  }

  async function signUpWithPassword() {
    const origin = window.location.origin;
    const { error } = await supabaseBrowser.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/dashboard` }
    });
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    setAuthMessage(tr("dashboard.accountCreated"));
  }

  async function fetchLatestClip(jobId: string) {
    const token = accessToken;
    if (!token) return null;
    const res = await fetch(`/api/jobs/${jobId}/export`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const data = await readJsonSafe(res);
    if (!res.ok) return null;
    const clips = (data.clips || []) as Array<{ clip_url?: string; title?: string; hashtags?: string[]; description?: string }>;
    return clips[0] || null;
  }

  async function handleDownloadLatest(jobId: string) {
    setCardActionState({ jobId, action: "download" });
    try {
      const clip = await fetchLatestClip(jobId);
      if (!clip?.clip_url) return;
      window.open(clip.clip_url, "_blank", "noopener,noreferrer");
    } finally {
      setCardActionState(null);
    }
  }

  async function handleCopyMetadata(jobId: string) {
    setCardActionState({ jobId, action: "copy" });
    try {
      const clip = await fetchLatestClip(jobId);
      if (!clip) return;
      const payload = [clip.title || "", clip.description || "", (clip.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
      if (!payload) return;
      await navigator.clipboard.writeText(payload);
    } finally {
      setCardActionState(null);
    }
  }

  async function handleDeleteJob(jobId: string) {
    const confirmed = window.confirm("Tem certeza que deseja excluir este vídeo e todos os clipes gerados?");
    if (!confirmed) return;
    setCardActionState({ jobId, action: "delete" });
    try {
      const token = accessToken;
      if (!token) return;
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Não foi possível excluir o vídeo.";
        window.alert(message);
        return;
      }
      await loadJobs(token);
    } finally {
      setCardActionState(null);
    }
  }

  const processingCount = jobs.filter((job) => job.status === "PROCESSING").length;
  const doneCount = jobs.filter((job) => job.status === "DONE").length;
  const failedCount = jobs.filter((job) => job.status === "FAILED").length;
  const latestJobId = jobs[0]?.id || null;

  const filteredJobs = useMemo(() => {
    const now = Date.now();
    return jobs
      .filter((job) => (statusFilter === "ALL" ? true : job.status === statusFilter))
      .filter((job) => {
        if (!search.trim()) return true;
        return job.source_filename.toLowerCase().includes(search.trim().toLowerCase());
      })
      .filter((job) => {
        if (dateFilter === "ALL") return true;
        const createdAt = new Date(job.created_at).getTime();
        const days = dateFilter === "7D" ? 7 : 30;
        return now - createdAt <= days * 24 * 60 * 60 * 1000;
      });
  }, [dateFilter, jobs, search, statusFilter]);

  if (sessionLoading) {
    return (
      <Card className="rounded-xl border-border/70">
        <CardHeader>
          <CardTitle>{tr("dashboard.loadingTitle")}</CardTitle>
          <CardDescription>{tr("dashboard.loadingBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SkeletonList rows={2} />
        </CardContent>
      </Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="mx-auto w-full max-w-xl rounded-xl border-border/70">
        <CardHeader>
          <CardTitle>{tr("dashboard.signInTitle")}</CardTitle>
          <CardDescription>{tr("dashboard.signInBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="email"
            placeholder={tr("dashboard.authEmailPlaceholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label={tr("dashboard.authEmailAria")}
          />
          <Input
            type="password"
            placeholder={tr("dashboard.authPasswordPlaceholder")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-label={tr("dashboard.authPasswordAria")}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={signInWithPassword} disabled={!email || !password}>
              {tr("dashboard.signIn")}
            </Button>
            <Button variant="secondary" onClick={signUpWithPassword} disabled={!email || !password}>
              {tr("dashboard.createAccount")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{tr("dashboard.authHelp")}</p>
          {authMessage ? <p className="text-sm text-muted-foreground">{authMessage}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projetos"
        subtitle="Acompanhe processamento, abra resultados e acione fluxos de IA."
        actions={
          <Button asChild>
            <a href="#new-video">Novo projeto</a>
          </Button>
        }
      />

      <Card className="hover-lift rounded-xl border-border/70 bg-gradient-to-b from-muted/40 to-background">
        <CardHeader>
          <CardTitle>Atalhos de Ferramentas</CardTitle>
          <CardDescription>Atalhos para os fluxos que você mais usa.</CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TOOL_ACTIONS.map((action) => {
                const Icon = action.icon;
                const href =
                  action.key === "long-to-shorts"
                    ? "#new-video"
                    : latestJobId
                      ? `/jobs/${latestJobId}`
                      : "#projects";
                if (action.comingSoon) {
                  return (
                    <Tooltip key={action.key}>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <button
                            type="button"
                            disabled
                            className="flex h-11 items-center justify-center gap-2 rounded-lg border bg-muted px-3 text-sm text-muted-foreground"
                          >
                            <Icon className="h-4 w-4" />
                            {action.label}
                          </button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Em breve</TooltipContent>
                    </Tooltip>
                  );
                }
                return (
                  <Button key={action.key} variant="outline" asChild className="h-11 justify-start gap-2">
                    <a href={href}>
                      <Icon className="h-4 w-4" />
                      {action.label}
                    </a>
                  </Button>
                );
              })}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      <div id="new-video">
        <UploadWidget onUploaded={loadJobs} />
      </div>

      <Card id="projects" className="rounded-xl border-border/70">
        <CardHeader>
          <CardTitle>Projetos</CardTitle>
          <CardDescription>Veja todos os jobs, filtre rápido e entre na edição.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="hover-lift rounded-xl border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-semibold">{jobs.length}</p>
            </div>
            <div className="hover-lift rounded-xl border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{tr("dashboard.processing")}</p>
              <p className="mt-1 text-2xl font-semibold">{processingCount}</p>
            </div>
            <div className="hover-lift rounded-xl border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{tr("dashboard.done")}</p>
              <p className="mt-1 text-2xl font-semibold">{doneCount}</p>
            </div>
            <div className="hover-lift rounded-xl border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{tr("dashboard.failed")}</p>
              <p className="mt-1 text-2xl font-semibold">{failedCount}</p>
            </div>
          </div>

          <Tabs defaultValue="ALL" onValueChange={setStatusFilter}>
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="ALL">Todos</TabsTrigger>
              <TabsTrigger value="PROCESSING">{tr("dashboard.processing")}</TabsTrigger>
              <TabsTrigger value="DONE">{tr("dashboard.done")}</TabsTrigger>
              <TabsTrigger value="FAILED">{tr("dashboard.failed")}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-2 md:grid-cols-[1fr,220px,160px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome do arquivo..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={tr("dashboard.filterStatus")} />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="ALL">Todos os status</SelectItem>
                <SelectItem value="PENDING">{tr("dashboard.pending")}</SelectItem>
                <SelectItem value="UPLOADED">{tr("dashboard.uploaded")}</SelectItem>
                <SelectItem value="READY_TO_PROCESS">{tr("dashboard.ready")}</SelectItem>
                <SelectItem value="PROCESSING">{tr("dashboard.processing")}</SelectItem>
                <SelectItem value="DONE">{tr("dashboard.done")}</SelectItem>
                <SelectItem value="FAILED">{tr("dashboard.failed")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todo período</SelectItem>
                <SelectItem value="7D">Últimos 7 dias</SelectItem>
                <SelectItem value="30D">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <SkeletonList rows={3} />
          ) : filteredJobs.length === 0 ? (
            <EmptyState
              icon={Film}
              title="Nenhum projeto encontrado"
              description="Comece enviando um vídeo e seu projeto vai aparecer aqui."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredJobs.map((job) => (
                <div key={job.id} className="hover-lift overflow-hidden rounded-xl border bg-card shadow-sm">
                  <div className="aspect-video bg-muted/40">
                    {job.preview_url ? (
                      <video
                        src={job.preview_url}
                        preload="metadata"
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                        aria-label={`${tr("dashboard.previewAria")} ${job.source_filename}`}
                      />
                    ) : null}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{job.source_filename}</p>
                        <p className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleDateString()}</p>
                      </div>
                      <StatusChip status={job.status} />
                    </div>
                    {job.status === "PROCESSING" ? (
                      <div className="space-y-1.5">
                        <Progress value={Math.max(1, Math.min(99, Number(job.processing_progress || 1)))} />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{stageLabel(job.processing_stage)}</span>
                          <span>{Math.round(Math.max(1, Math.min(99, Number(job.processing_progress || 1))))}%</span>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href={`/jobs/${job.id}`}>{tr("dashboard.open")}</Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={job.status !== "DONE" || cardActionState?.jobId === job.id}
                        onClick={() => handleDownloadLatest(job.id)}
                      >
                        {cardActionState?.jobId === job.id && cardActionState.action === "download" ? "Carregando..." : "Baixar último"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={job.status !== "DONE" || cardActionState?.jobId === job.id}
                        onClick={() => handleCopyMetadata(job.id)}
                      >
                        {cardActionState?.jobId === job.id && cardActionState.action === "copy" ? "Copiando..." : "Copiar metadados"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cardActionState?.jobId === job.id}
                        onClick={() => handleDeleteJob(job.id)}
                      >
                        {cardActionState?.jobId === job.id && cardActionState.action === "delete" ? (
                          "Excluindo..."
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
