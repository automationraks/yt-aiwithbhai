-- Phase H: operational controls, unified workflow history and monitoring support.
-- Workflow names and statuses evolve as new automation modules are added.
-- Keep the event log extensible; validate event payloads in application code.

create table if not exists public.operations_controls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  control_key text not null check (control_key in (
    'publishing_all','publishing_youtube','publishing_instagram',
    'content_generation','research_automation'
  )),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(owner_id, control_key)
);
create index if not exists operations_controls_owner_idx
  on public.operations_controls(owner_id, control_key);
alter table public.operations_controls enable row level security;
drop policy if exists operations_controls_owner_all on public.operations_controls;
create policy operations_controls_owner_all on public.operations_controls
  for all to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Seed safe defaults; no automation is silently paused by installing this migration.
