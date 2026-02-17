import { JobDetailClient } from "@/components/job-detail-client";

export default function JobPage({ params }: { params: { jobId: string } }) {
  return <JobDetailClient jobId={params.jobId} />;
}
