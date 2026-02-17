alter table public.jobs
  add column if not exists processing_stage text,
  add column if not exists processing_progress integer not null default 0,
  add column if not exists processing_note text;

create index if not exists idx_jobs_processing_stage on public.jobs(processing_stage);
