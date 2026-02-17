-- SplitShorts MVP schema

create extension if not exists pgcrypto;

create type public.job_status as enum (
  'PENDING',
  'UPLOADED',
  'PROCESSING',
  'DONE',
  'FAILED',
  'EXPIRED'
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  profile_name text,
  plan_type text not null default 'FREE',
  minutes_remaining integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status public.job_status not null default 'PENDING',
  source_path text not null,
  source_filename text not null,
  source_duration_sec integer not null,
  crop_config jsonb not null,
  suggestions jsonb,
  error_message text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_exports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  clip_id text not null,
  clip_path text not null,
  clip_url text not null,
  title text not null,
  description text not null,
  hashtags text[] not null default '{}',
  hook text not null,
  reason text not null,
  provider_metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (job_id, clip_id)
);

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  minutes_used integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  created_at timestamptz not null default now()
);

-- Phase 1.5 scaffold
create table if not exists public.publish_tokens (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('youtube', 'tiktok', 'instagram', 'x')),
  user_id uuid not null references public.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  scope text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, user_id)
);

create table if not exists public.publish_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_export_id uuid not null references public.job_exports(id) on delete cascade,
  provider text not null check (provider in ('youtube', 'tiktok', 'instagram', 'x')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_user_created on public.jobs(user_id, created_at desc);
create index if not exists idx_jobs_status_created on public.jobs(status, created_at asc);
create index if not exists idx_jobs_expires on public.jobs(expires_at);
create index if not exists idx_exports_job_created on public.job_exports(job_id, created_at asc);
create index if not exists idx_exports_expires on public.job_exports(expires_at);

alter table public.users enable row level security;
alter table public.jobs enable row level security;
alter table public.job_exports enable row level security;
alter table public.usage_logs enable row level security;
alter table public.publish_tokens enable row level security;
alter table public.publish_queue enable row level security;
alter table public.feedback enable row level security;

create policy "users_select_own" on public.users
  for select using (auth.uid() = id);
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

create policy "jobs_select_own" on public.jobs
  for select using (auth.uid() = user_id);
create policy "jobs_insert_own" on public.jobs
  for insert with check (auth.uid() = user_id);
create policy "jobs_update_own" on public.jobs
  for update using (auth.uid() = user_id);

create policy "exports_select_own" on public.job_exports
  for select using (auth.uid() = user_id);

create policy "usage_select_own" on public.usage_logs
  for select using (auth.uid() = user_id);

create policy "tokens_select_own" on public.publish_tokens
  for select using (auth.uid() = user_id);
create policy "tokens_insert_own" on public.publish_tokens
  for insert with check (auth.uid() = user_id);
create policy "tokens_update_own" on public.publish_tokens
  for update using (auth.uid() = user_id);

create policy "publish_queue_select_own" on public.publish_queue
  for select using (auth.uid() = user_id);
create policy "publish_queue_insert_own" on public.publish_queue
  for insert with check (auth.uid() = user_id);
create policy "publish_queue_update_own" on public.publish_queue
  for update using (auth.uid() = user_id);

-- feedback is public insert for MVP beta collection
create policy "feedback_insert_any" on public.feedback
  for insert with check (true);
