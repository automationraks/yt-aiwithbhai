-- Brand Studio packages for research-backed Shorts.
create table if not exists public.brand_studio_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  calendar_id uuid not null references public.content_calendar(id) on delete cascade,
  script_id uuid not null references public.content_scripts(id) on delete cascade,
  version integer not null default 1,
  brand_package jsonb not null default '{}'::jsonb,
  provider text,
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(script_id, version)
);
alter table public.brand_studio_assets enable row level security;
drop policy if exists owner_all on public.brand_studio_assets;
create policy owner_all on public.brand_studio_assets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists brand_studio_assets_owner_created_idx
  on public.brand_studio_assets(owner_id, created_at desc);
create index if not exists brand_studio_assets_calendar_idx
  on public.brand_studio_assets(calendar_id, created_at desc);
