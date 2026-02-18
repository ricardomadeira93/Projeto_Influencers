alter table public.jobs
  add column if not exists desired_clip_count int;
