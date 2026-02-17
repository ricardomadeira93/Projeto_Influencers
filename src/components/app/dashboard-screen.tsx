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

type JobListItem = {
  id: string;
  status: string;
  source_filename: string;
  preview_url?: string;
  created_at: string;
  expires_at: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function DashboardScreen() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  async function loadJobs() {
    setLoading(true);
    const headers = await authHeaders();
    if (!headers.Authorization) {
      setIsAuthenticated(false);
      setJobs([]);
      setLoading(false);
      return;
    }
    const res = await fetch("/api/jobs", { headers, cache: "no-store" });
    if (res.status === 401) {
      setIsAuthenticated(false);
      setJobs([]);
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) setJobs(data.jobs || []);
    setLoading(false);
  }

  useEffect(() => {
    async function bootstrapAuth() {
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const hasSession = Boolean(data.session?.access_token);
        setIsAuthenticated(hasSession);
        if (hasSession) {
          await loadJobs();
        } else {
          setLoading(false);
        }
      } finally {
        setSessionLoading(false);
      }
    }

    bootstrapAuth().catch(console.error);

    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange(async (_event, session) => {
      const hasSession = Boolean(session?.access_token);
      setIsAuthenticated(hasSession);
      if (hasSession) {
        await loadJobs();
      } else {
        setJobs([]);
      }
    });

    return () => subscription.subscription.unsubscribe();
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
    setAuthMessage("Signed in.");
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
    setAuthMessage("Account created. Check your email if confirmation is required.");
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
          <CardTitle>Loading dashboard</CardTitle>
          <CardDescription>Checking your session.</CardDescription>
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
          <CardTitle>Sign in to continue</CardTitle>
          <CardDescription>
            The dashboard is private. Use a magic link to access your uploads, processing status, and exports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email for magic link"
          />
          <Input
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={signInWithPassword} disabled={!email || !password}>
              Sign in
            </Button>
            <Button variant="secondary" onClick={signUpWithPassword} disabled={!email || !password}>
              Create account
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use email/password authentication for now. You can switch providers later in Supabase Auth settings.
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
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage videos, monitor status, and generate clips.</p>
        </div>
        <Button asChild>
          <a href="#new-video">New video</a>
        </Button>
      </div>

      <div id="new-video">
        <UploadWidget onUploaded={loadJobs} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Total videos</p>
              <p className="mt-1 text-2xl font-semibold">{jobs.length}</p>
            </div>
            <Film className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Processing</p>
              <p className="mt-1 text-2xl font-semibold">{processingCount}</p>
            </div>
            <Workflow className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Completed</p>
              <p className="mt-1 text-2xl font-semibold">{doneCount}</p>
            </div>
            <Timer className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Failed</p>
              <p className="mt-1 text-2xl font-semibold">{failedCount}</p>
            </div>
            <Filter className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Video processing</CardTitle>
          <CardDescription>Track each upload from pending to final clips.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs defaultValue="all" onValueChange={(value) => setStatusFilter(value === "all" ? "ALL" : value)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="PROCESSING">Processing</TabsTrigger>
                <TabsTrigger value="DONE">Done</TabsTrigger>
                <TabsTrigger value="FAILED">Failed</TabsTrigger>
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
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="UPLOADED">Uploaded</SelectItem>
                  <SelectItem value="READY_TO_PROCESS">Ready to process</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                  <SelectItem value="DONE">Done</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Preview</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Action</TableHead>
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
                      No videos found. Upload a video to create your first clip pipeline.
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
                          aria-label={`Preview of ${job.source_filename}`}
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
                        <Link href={`/jobs/${job.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">Currently processing: {processingCount}</p>
        </CardContent>
      </Card>
    </div>
  );
}
