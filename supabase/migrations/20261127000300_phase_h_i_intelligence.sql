-- Phase H hardening and Phase I content intelligence persistence.
-- This application authenticates through app_sessions/app_users and uses a
-- server-side service-role client. Keep owner IDs aligned with app_users.
alter table public.workflow_event_logs
  drop constraint if exists workflow_event_logs_workflow_check;
alter table public.workflow_event_logs
  drop constraint if exists workflow_event_logs_status_check;

-- Allow authenticated application users to manage their own operational flags.
drop policy if exists operations_controls_owner_all on public.operations_controls;
create policy operations_controls_owner_all on public.operations_controls
  for all to authenticated
  using (owner_id = (select id from public.app_users where id = auth.uid()))
  with check (owner_id = (select id from public.app_users where id = auth.uid()));

create table if not exists public.content_intelligence_reports (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 report_date date not null,
 summary jsonb not null default '{}'::jsonb,
 trending_topics jsonb not null default '[]'::jsonb,
 content_gaps jsonb not null default '[]'::jsonb,
 recommendations jsonb not null default '[]'::jsonb,
 source_counts jsonb not null default '{}'::jsonb,
 generated_at timestamptz not null default now(),
 unique(owner_id,report_date)
);
create index if not exists content_intelligence_reports_owner_date_idx
 on public.content_intelligence_reports(owner_id,report_date desc);
alter table public.content_intelligence_reports enable row level security;
drop policy if exists content_intelligence_reports_owner_all on public.content_intelligence_reports;
create policy content_intelligence_reports_owner_all on public.content_intelligence_reports
 for all to authenticated
 using (owner_id = (select id from public.app_users where id = auth.uid()))
 with check (owner_id = (select id from public.app_users where id = auth.uid()));

create index if not exists workflow_event_logs_owner_created_idx
 on public.workflow_event_logs(owner_id,created_at desc);
create index if not exists app_notifications_owner_unread_idx
 on public.app_notifications(owner_id,created_at desc) where read_at is null;
