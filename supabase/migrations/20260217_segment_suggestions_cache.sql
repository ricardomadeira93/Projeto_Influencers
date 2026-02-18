create table if not exists public.segment_suggestions_cache (
  id uuid primary key default gen_random_uuid(),
  transcript_hash text not null,
  provider text not null,
  bounds_signature text not null,
  suggestions_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_segment_cache_lookup
  on public.segment_suggestions_cache(transcript_hash, provider, bounds_signature, created_at desc);
