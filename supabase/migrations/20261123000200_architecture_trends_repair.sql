-- Repair/upgrade AI Architectural Trends storage safely, including partially-created tables.
create table if not exists public.architecture_trends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  trend_key text not null,
  title text not null,
  industry text not null default 'Cross-industry',
  company_examples jsonb not null default '[]'::jsonb,
  business_problem text not null default '',
  pattern text not null default '',
  architecture_flow jsonb not null default '[]'::jsonb,
  design_considerations jsonb not null default '[]'::jsonb,
  tradeoffs jsonb not null default '[]'::jsonb,
  source_links jsonb not null default '[]'::jsonb,
  source_video_ids jsonb not null default '[]'::jsonb,
  confidence_score numeric not null default 0,
  evidence_note text not null default '',
  generated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.architecture_trends
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists trend_key text,
  add column if not exists title text,
  add column if not exists industry text not null default 'Cross-industry',
  add column if not exists company_examples jsonb not null default '[]'::jsonb,
  add column if not exists business_problem text not null default '',
  add column if not exists pattern text not null default '',
  add column if not exists architecture_flow jsonb not null default '[]'::jsonb,
  add column if not exists design_considerations jsonb not null default '[]'::jsonb,
  add column if not exists tradeoffs jsonb not null default '[]'::jsonb,
  add column if not exists source_links jsonb not null default '[]'::jsonb,
  add column if not exists source_video_ids jsonb not null default '[]'::jsonb,
  add column if not exists confidence_score numeric not null default 0,
  add column if not exists evidence_note text not null default '',
  add column if not exists generated_by text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists architecture_trends_owner_trend_key_uidx
  on public.architecture_trends (owner_id, trend_key);
create index if not exists architecture_trends_owner_updated_idx
  on public.architecture_trends (owner_id, updated_at desc);

alter table public.architecture_trends enable row level security;
drop policy if exists architecture_trends_owner_all on public.architecture_trends;
create policy architecture_trends_owner_all on public.architecture_trends
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.architecture_trends to authenticated;
