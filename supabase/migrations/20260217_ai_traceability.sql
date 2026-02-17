alter table public.jobs
  add column if not exists transcript text,
  add column if not exists requested_clips jsonb;
