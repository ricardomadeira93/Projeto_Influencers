import { JobScreen } from "@/components/app/job-screen";

export default function JobPage({ params }: { params: { jobId: string } }) {
  return <JobScreen jobId={params.jobId} />;
}
