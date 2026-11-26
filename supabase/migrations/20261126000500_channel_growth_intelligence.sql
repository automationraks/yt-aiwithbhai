-- Daily first-party channel snapshots and weekly growth intelligence.
create table if not exists public.channel_metric_snapshots (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 platform text not null check(platform in ('youtube','instagram')),
 snapshot_date date not null,
 followers bigint,
 subscribers bigint,
 total_views bigint,
 media_count bigint,
 video_count bigint,
 recent_views bigint,
 recent_likes bigint,
 recent_comments bigint,
 engagement_rate numeric(8,4),
 source text not null default 'live_api',
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(owner_id,platform,snapshot_date)
);
create index if not exists channel_metric_snapshots_owner_date_idx on public.channel_metric_snapshots(owner_id,snapshot_date desc);
alter table public.channel_metric_snapshots enable row level security;
drop policy if exists channel_metric_snapshots_owner_read on public.channel_metric_snapshots;
create policy channel_metric_snapshots_owner_read on public.channel_metric_snapshots for select using(owner_id=(select id from public.app_users where id=auth.uid()));
drop policy if exists channel_metric_snapshots_owner_insert on public.channel_metric_snapshots;
create policy channel_metric_snapshots_owner_insert on public.channel_metric_snapshots for insert with check(owner_id=(select id from public.app_users where id=auth.uid()));
drop policy if exists channel_metric_snapshots_owner_update on public.channel_metric_snapshots;
create policy channel_metric_snapshots_owner_update on public.channel_metric_snapshots for update using(owner_id=(select id from public.app_users where id=auth.uid())) with check(owner_id=(select id from public.app_users where id=auth.uid()));

create table if not exists public.channel_weekly_reports (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 week_start date not null,
 week_end date not null,
 report jsonb not null default '{}'::jsonb,
 generated_at timestamptz not null default now(),
 unique(owner_id,week_start,week_end)
);
create index if not exists channel_weekly_reports_owner_week_idx on public.channel_weekly_reports(owner_id,week_start desc);
alter table public.channel_weekly_reports enable row level security;
drop policy if exists channel_weekly_reports_owner_all on public.channel_weekly_reports;
create policy channel_weekly_reports_owner_all on public.channel_weekly_reports for all using(owner_id=(select id from public.app_users where id=auth.uid())) with check(owner_id=(select id from public.app_users where id=auth.uid()));
