-- Phase H: operational controls, unified workflow history and monitoring support.
alter table public.workflow_event_logs
  drop constraint if exists workflow_event_logs_workflow_check;
alter table public.workflow_event_logs
  add constraint workflow_event_logs_workflow_check
  check (workflow in ('idea_generation','video_production','publishing'));

alter table public.workflow_event_logs
  drop constraint if exists workflow_event_logs_status_check;
alter table public.workflow_event_logs
  add constraint workflow_event_logs_status_check
  check (status in ('started','completed','failed','skipped','review_required','queued','processing','scheduled'));

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
