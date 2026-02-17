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
  const [authMessage, setAuthMessage] = useState("");

  async function loadJobs() {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetch("/api/jobs", { headers: await authHeaders() });
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
      const { data } = await supabaseBrowser.auth.getSession();
      const hasSession = Boolean(data.session?.access_token);
      setIsAuthenticated(hasSession);
      setSessionLoading(false);
      if (hasSession) {
        loadJobs().catch(console.error);
      } else {
        setLoading(false);
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
  }, [isAuthenticated]);

  async function signInWithMagicLink() {
    const origin = window.location.origin;
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/dashboard` }
    });
    setAuthMessage(error ? error.message : "Magic link sent. Check your inbox.");
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
            The dashboard is private. Use a magic link to access your uploads, job status, and exports.
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
          <Button onClick={signInWithMagicLink} disabled={!email}>
            Send magic link
          </Button>
          <p className="text-xs text-muted-foreground">
            You will be redirected back to <code>/dashboard</code> after authentication.
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
          <p className="text-sm text-muted-foreground">Manage jobs, monitor status, and generate clips.</p>
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
              <p className="text-xs uppercase text-muted-foreground">Total jobs</p>
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
          <CardTitle>Jobs</CardTitle>
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
                      <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                    </TableRow>
                  </>
                ) : null}

                {!loading && !filteredJobs.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No jobs found. Upload a video to create your first job.
                    </TableCell>
                  </TableRow>
                ) : null}

                {filteredJobs.map((job) => (
                  <TableRow key={job.id}>
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
