-- Phase H completion + Phase I content intelligence persistence.
create table if not exists public.content_intelligence_reports (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
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
 for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());

create index if not exists workflow_event_logs_owner_created_idx
 on public.workflow_event_logs(owner_id,created_at desc);
create index if not exists app_notifications_owner_unread_idx
 on public.app_notifications(owner_id,created_at desc) where read_at is null;
