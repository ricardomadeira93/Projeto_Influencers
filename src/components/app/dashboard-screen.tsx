"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { UploadWidget } from "@/components/app/upload-widget";
import { JobStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  async function loadJobs() {
    setLoading(true);
    const res = await fetch("/api/jobs", { headers: await authHeaders() });
    const data = await res.json();
    if (res.ok) setJobs(data.jobs || []);
    setLoading(false);
  }

  useEffect(() => {
    loadJobs().catch(console.error);
  }, []);

  const filteredJobs = useMemo(() => {
    if (statusFilter === "ALL") return jobs;
    return jobs.filter((job) => job.status === statusFilter);
  }, [jobs, statusFilter]);

  const processingCount = jobs.filter((j) => j.status === "PROCESSING").length;

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
