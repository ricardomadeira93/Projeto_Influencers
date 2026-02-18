create table if not exists public.user_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_templates_user_created
  on public.user_templates(user_id, created_at desc);

alter table public.user_templates enable row level security;

drop policy if exists "user_templates_select_own" on public.user_templates;
create policy "user_templates_select_own" on public.user_templates
  for select using (auth.uid() = user_id);

drop policy if exists "user_templates_insert_own" on public.user_templates;
create policy "user_templates_insert_own" on public.user_templates
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_templates_update_own" on public.user_templates;
create policy "user_templates_update_own" on public.user_templates
  for update using (auth.uid() = user_id);

drop policy if exists "user_templates_delete_own" on public.user_templates;
create policy "user_templates_delete_own" on public.user_templates
  for delete using (auth.uid() = user_id);
