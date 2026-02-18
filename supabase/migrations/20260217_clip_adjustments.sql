create table if not exists public.clip_adjustments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  clip_id uuid not null references public.job_exports(id) on delete cascade,
  ai_start_s numeric(10,3) not null,
  ai_end_s numeric(10,3) not null,
  final_start_s numeric(10,3) not null,
  final_end_s numeric(10,3) not null,
  delta_start_s numeric(10,3) not null,
  delta_end_s numeric(10,3) not null,
  delta_duration_s numeric(10,3) not null,
  nudge_count_start int not null default 0,
  nudge_count_end int not null default 0,
  set_at_playhead_count int not null default 0,
  reset_count int not null default 0,
  session_duration_ms int
);

create index if not exists idx_clip_adjustments_job_clip on public.clip_adjustments(job_id, clip_id);
create index if not exists idx_clip_adjustments_user_created on public.clip_adjustments(user_id, created_at desc);

alter table public.clip_adjustments enable row level security;

create policy "clip_adjustments_select_own" on public.clip_adjustments
  for select using (auth.uid() = user_id);

create policy "clip_adjustments_insert_own" on public.clip_adjustments
  for insert with check (auth.uid() = user_id);
