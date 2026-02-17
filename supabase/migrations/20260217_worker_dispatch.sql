-- GitHub Actions worker lifecycle enhancements

alter type public.job_status add value if not exists 'READY_TO_PROCESS';

alter table public.jobs
  add column if not exists processing_started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists dispatch_requested_at timestamptz;

create index if not exists idx_jobs_user_processing on public.jobs(user_id, status);
