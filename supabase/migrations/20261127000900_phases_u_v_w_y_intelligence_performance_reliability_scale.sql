-- Phases U, V, W and Y: live intelligence, performance feedback,
-- recoverable automation incidents, and workspace-level business reporting.
-- Intentionally uses single-column workspace references; owner checks remain
-- enforced in every API query to avoid mismatched composite foreign keys.

create table if not exists public.trend_research_runs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null references public.channel_workspaces(id) on delete cascade,
 status text not null default 'completed' check(status in ('running','completed','partial','failed')),
 query_count integer not null default 0,
 result_count integer not null default 0,
 provider text not null default 'youtube_data_api',
 quota_units integer not null default 0,
 error_message text,
 evidence jsonb not null default '{}'::jsonb,
 started_at timestamptz not null default now(),
 completed_at timestamptz
);
create index if not exists trend_research_runs_owner_ws_idx
 on public.trend_research_runs(owner_id,workspace_id,started_at desc);

create table if not exists public.trend_signals (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null references public.channel_workspaces(id) on delete cascade,
 run_id uuid references public.trend_research_runs(id) on delete set null,
 platform text not null default 'youtube' check(platform in ('youtube','instagram','web')),
 topic text not null,
 title text not null,
 source_url text,
 channel_title text,
 published_at timestamptz,
 observed_at timestamptz not null default now(),
 views bigint,
 engagement jsonb not null default '{}'::jsonb,
 language text,
 demand_score integer not null default 0 check(demand_score between 0 and 100),
 competition_score integer not null default 0 check(competition_score between 0 and 100),
 saturation_score integer not null default 0 check(saturation_score between 0 and 100),
 opportunity_score integer not null default 0 check(opportunity_score between 0 and 100),
 evidence jsonb not null default '{}'::jsonb,
 unique(owner_id,workspace_id,platform,source_url)
);
create index if not exists trend_signals_rank_idx
 on public.trend_signals(owner_id,workspace_id,observed_at desc,opportunity_score desc);

create table if not exists public.performance_feedback (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null references public.channel_workspaces(id) on delete cascade,
 idea_id uuid references public.content_ideas(id) on delete set null,
 platform text not null check(platform in ('youtube','instagram')),
 period_start date not null,
 period_end date not null,
 views bigint not null default 0,
 likes bigint not null default 0,
 comments bigint not null default 0,
 shares bigint not null default 0,
 saves bigint not null default 0,
 watch_time_minutes numeric(16,2),
 average_view_duration_seconds numeric(12,2),
 average_percentage_viewed numeric(7,3),
 followers_gained bigint not null default 0,
 revenue numeric(14,2) not null default 0,
 currency text not null default 'INR',
 source text not null default 'manual',
 raw_metrics jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(owner_id,workspace_id,idea_id,platform,period_start,period_end)
);
create index if not exists performance_feedback_rank_idx
 on public.performance_feedback(owner_id,workspace_id,period_end desc);

create table if not exists public.automation_incidents (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid references public.channel_workspaces(id) on delete cascade,
 incident_key text not null,
 workflow text not null,
 job_id uuid,
 severity text not null default 'warning' check(severity in ('info','warning','critical')),
 status text not null default 'open' check(status in ('open','retrying','resolved','ignored')),
 title text not null,
 detail text not null,
 attempts integer not null default 0,
 max_attempts integer not null default 3,
 next_retry_at timestamptz,
 last_error text,
 metadata jsonb not null default '{}'::jsonb,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 resolved_at timestamptz,
 unique(owner_id,incident_key)
);
create index if not exists automation_incidents_queue_idx
 on public.automation_incidents(status,next_retry_at,severity);

create table if not exists public.workspace_access_grants (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null references public.channel_workspaces(id) on delete cascade,
 member_email text not null,
 role text not null default 'viewer' check(role in ('admin','editor','analyst','viewer')),
 status text not null default 'invited' check(status in ('invited','active','revoked')),
 invited_at timestamptz not null default now(),
 unique(workspace_id,member_email)
);
create index if not exists workspace_access_grants_owner_idx
 on public.workspace_access_grants(owner_id,workspace_id,status);

create table if not exists public.revenue_attributions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null references public.channel_workspaces(id) on delete cascade,
 idea_id uuid references public.content_ideas(id) on delete set null,
 platform text check(platform in ('youtube','instagram')),
 revenue_type text not null,
 source_id uuid,
 amount numeric(14,2) not null default 0 check(amount >= 0),
 currency text not null default 'INR',
 attribution_date date not null default current_date,
 attribution_model text not null default 'direct',
 evidence jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists revenue_attributions_workspace_date_idx
 on public.revenue_attributions(owner_id,workspace_id,attribution_date desc);

alter table public.trend_research_runs enable row level security;
alter table public.trend_signals enable row level security;
alter table public.performance_feedback enable row level security;
alter table public.automation_incidents enable row level security;
alter table public.workspace_access_grants enable row level security;
alter table public.revenue_attributions enable row level security;

drop policy if exists phase_uvw_y_owner_all on public.trend_research_runs;
create policy phase_uvw_y_owner_all on public.trend_research_runs for all to authenticated
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));
drop policy if exists phase_uvw_y_owner_all on public.trend_signals;
create policy phase_uvw_y_owner_all on public.trend_signals for all to authenticated
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));
drop policy if exists phase_uvw_y_owner_all on public.performance_feedback;
create policy phase_uvw_y_owner_all on public.performance_feedback for all to authenticated
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));
drop policy if exists phase_uvw_y_owner_all on public.automation_incidents;
create policy phase_uvw_y_owner_all on public.automation_incidents for all to authenticated
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));
drop policy if exists phase_uvw_y_owner_all on public.workspace_access_grants;
create policy phase_uvw_y_owner_all on public.workspace_access_grants for all to authenticated
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));
drop policy if exists phase_uvw_y_owner_all on public.revenue_attributions;
create policy phase_uvw_y_owner_all on public.revenue_attributions for all to authenticated
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));

-- Backfill revenue attribution from existing ledger entries without changing
-- the original ledger; repeated execution is safe through evidence source key.
insert into public.revenue_attributions
 (owner_id,workspace_id,idea_id,platform,revenue_type,source_id,amount,currency,attribution_date,attribution_model,evidence)
select m.owner_id,m.workspace_id,m.idea_id,m.platform,m.revenue_type,m.id,m.amount,m.currency,m.entry_date,'ledger_entry',
 jsonb_build_object('source','monetization_entries','source_id',m.id)
from public.monetization_entries m
where m.workspace_id is not null
and not exists(select 1 from public.revenue_attributions a where a.owner_id=m.owner_id and a.evidence->>'source_id'=m.id::text);
