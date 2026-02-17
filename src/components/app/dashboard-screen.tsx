"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Film, Filter, Timer, Workflow } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { UploadWidget } from "@/components/app/upload-widget";
import { JobStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/components/app/language-provider";

type JobListItem = {
  id: string;
  status: string;
  source_filename: string;
  preview_url?: string;
  created_at: string;
  expires_at: string;
};

export function DashboardScreen() {
  const { tr } = useLanguage();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  async function loadJobs(tokenOverride?: string | null) {
    const token = tokenOverride ?? accessToken;
    setLoading(true);
    if (!token) {
      setIsAuthenticated(false);
      setJobs([]);
      setLoading(false);
      return;
    }
    const res = await fetch("/api/jobs", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 401) {
      setIsAuthenticated(false);
      setAccessToken(null);
      setJobs([]);
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) setJobs(data.jobs || []);
    setLoading(false);
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
        if (token) {
          await loadJobs(token);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setAccessToken(null);
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

  async function signInWithPassword() {
    const { error } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password
    });
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

  const filteredJobs = useMemo(() => {
    if (statusFilter === "ALL") return jobs;
    return jobs.filter((job) => job.status === statusFilter);
  }, [jobs, statusFilter]);

  const processingCount = jobs.filter((j) => j.status === "PROCESSING").length;
  const doneCount = jobs.filter((j) => j.status === "DONE").length;
  const failedCount = jobs.filter((j) => j.status === "FAILED").length;

  if (sessionLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{tr("dashboard.loadingTitle")}</CardTitle>
          <CardDescription>{tr("dashboard.loadingBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{tr("dashboard.signInTitle")}</CardTitle>
          <CardDescription>
            {tr("dashboard.signInBody")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="email"
            placeholder={tr("dashboard.authEmailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label={tr("dashboard.authEmailAria")}
          />
          <Input
            type="password"
            placeholder={tr("dashboard.authPasswordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          <p className="text-xs text-muted-foreground">
            {tr("dashboard.authHelp")}
          </p>
          {authMessage ? <p className="text-sm text-muted-foreground">{authMessage}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{tr("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">{tr("dashboard.subtitle")}</p>
        </div>
        <Button asChild>
          <a href="#new-video">{tr("dashboard.newVideo")}</a>
        </Button>
      </div>

      <div id="new-video">
        <UploadWidget onUploaded={loadJobs} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">{tr("dashboard.totalVideos")}</p>
              <p className="mt-1 text-2xl font-semibold">{jobs.length}</p>
            </div>
            <Film className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">{tr("dashboard.processing")}</p>
              <p className="mt-1 text-2xl font-semibold">{processingCount}</p>
            </div>
            <Workflow className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">{tr("dashboard.completed")}</p>
              <p className="mt-1 text-2xl font-semibold">{doneCount}</p>
            </div>
            <Timer className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">{tr("dashboard.failed")}</p>
              <p className="mt-1 text-2xl font-semibold">{failedCount}</p>
            </div>
            <Filter className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tr("dashboard.videoProcessing")}</CardTitle>
          <CardDescription>{tr("dashboard.videoProcessingBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs defaultValue="all" onValueChange={(value) => setStatusFilter(value === "all" ? "ALL" : value)}>
              <TabsList>
                <TabsTrigger value="all">{tr("dashboard.all")}</TabsTrigger>
                <TabsTrigger value="PROCESSING">{tr("dashboard.processing")}</TabsTrigger>
                <TabsTrigger value="DONE">{tr("dashboard.done")}</TabsTrigger>
                <TabsTrigger value="FAILED">{tr("dashboard.failed")}</TabsTrigger>
              </TabsList>
              <TabsContent value="all" />
              <TabsContent value="PROCESSING" />
              <TabsContent value="DONE" />
              <TabsContent value="FAILED" />
            </Tabs>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select onValueChange={setStatusFilter} defaultValue="ALL">
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={tr("dashboard.filterStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{tr("dashboard.allStatuses")}</SelectItem>
                  <SelectItem value="PENDING">{tr("dashboard.pending")}</SelectItem>
                  <SelectItem value="UPLOADED">{tr("dashboard.uploaded")}</SelectItem>
                  <SelectItem value="READY_TO_PROCESS">{tr("dashboard.ready")}</SelectItem>
                  <SelectItem value="PROCESSING">{tr("dashboard.processing")}</SelectItem>
                  <SelectItem value="DONE">{tr("dashboard.done")}</SelectItem>
                  <SelectItem value="FAILED">{tr("dashboard.failed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">{tr("dashboard.preview")}</TableHead>
                  <TableHead>{tr("dashboard.file")}</TableHead>
                  <TableHead>{tr("dashboard.status")}</TableHead>
                  <TableHead>{tr("dashboard.created")}</TableHead>
                  <TableHead>{tr("dashboard.expires")}</TableHead>
                  <TableHead className="text-right">{tr("dashboard.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <>
                    <TableRow>
                      <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
                    </TableRow>
                  </>
                ) : null}

                {!loading && !filteredJobs.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {tr("dashboard.empty")}
                    </TableCell>
                  </TableRow>
                ) : null}

                {filteredJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      {job.preview_url ? (
                        <video
                          src={job.preview_url}
                          preload="metadata"
                          muted
                          playsInline
                          className="h-16 w-24 rounded-md border bg-muted object-cover"
                          aria-label={`${tr("dashboard.previewAria")} ${job.source_filename}`}
                        />
                      ) : (
                        <div className="h-16 w-24 rounded-md border bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{job.source_filename}</TableCell>
                    <TableCell><JobStatusBadge status={job.status} /></TableCell>
                    <TableCell>{new Date(job.created_at).toLocaleString()}</TableCell>
                    <TableCell>{new Date(job.expires_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/jobs/${job.id}`}>{tr("dashboard.open")}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">{tr("dashboard.currentlyProcessing")} {processingCount}</p>
        </CardContent>
      </Card>
    </div>
  );
}
