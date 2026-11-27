-- Phases L-P: opportunity scoring, scene asset queue, analytics imports and workspace isolation.
create table if not exists public.content_opportunity_scores (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null references public.channel_workspaces(id,owner_id) on delete cascade,
 report_date date not null default current_date,
 topic text not null,
 title text not null,
 rationale text not null,
 demand_score integer not null default 0 check(demand_score between 0 and 100),
 competition_score integer not null default 0 check(competition_score between 0 and 100),
 fit_score integer not null default 0 check(fit_score between 0 and 100),
 novelty_score integer not null default 0 check(novelty_score between 0 and 100),
 overall_score integer not null default 0 check(overall_score between 0 and 100),
 evidence jsonb not null default '{}'::jsonb,
 status text not null default 'suggested' check(status in ('suggested','shortlisted','dismissed','converted')),
 created_at timestamptz not null default now(),
 unique(owner_id,workspace_id,report_date,title)
);
create index if not exists content_opportunity_scores_rank_idx
 on public.content_opportunity_scores(owner_id,workspace_id,report_date desc,overall_score desc);

create table if not exists public.scene_asset_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null references public.channel_workspaces(id,owner_id) on delete cascade,
 idea_id uuid not null references public.content_ideas(id) on delete cascade,
 sequence integer not null check(sequence > 0),
 prompt text not null,
 negative_prompt text,
 provider text not null default 'pending' check(provider in ('pending','gemini','external_worker','stock_fallback')),
 status text not null default 'queued' check(status in ('queued','processing','completed','failed','skipped')),
 asset_storage_path text,
 asset_url text,
 error_message text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,idea_id,sequence)
);
create index if not exists scene_asset_jobs_queue_idx on public.scene_asset_jobs(status,created_at);

create table if not exists public.platform_analytics_imports (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null references public.channel_workspaces(id,owner_id) on delete cascade,
 platform text not null check(platform in ('youtube','instagram')),
 account_id uuid references public.channel_accounts(id) on delete set null,
 report_date date not null,
 views bigint not null default 0 check(views >= 0),
 watch_time_minutes numeric(16,2) not null default 0 check(watch_time_minutes >= 0),
 followers_gained bigint not null default 0,
 subscribers_gained bigint not null default 0,
 revenue numeric(14,2) not null default 0 check(revenue >= 0),
 currency text not null default 'INR' check(currency in ('INR','USD','EUR','GBP')),
 source text not null default 'manual_import',
 raw_data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(owner_id,workspace_id,platform,report_date,source)
);
create index if not exists platform_analytics_imports_date_idx
 on public.platform_analytics_imports(owner_id,workspace_id,report_date desc);

alter table public.content_intelligence_reports add column if not exists workspace_id uuid;
alter table public.content_intelligence_reports drop constraint if exists content_intelligence_reports_owner_id_report_date_key;
alter table public.monetization_entries add column if not exists workspace_id uuid;
alter table public.affiliate_partners add column if not exists workspace_id uuid;
alter table public.sponsorship_leads add column if not exists workspace_id uuid;
alter table public.content_roi_snapshots add column if not exists workspace_id uuid;
alter table public.affiliate_performance_daily add column if not exists workspace_id uuid;

update public.content_intelligence_reports r set workspace_id=w.id
 from public.channel_workspaces w where r.owner_id=w.owner_id and w.is_default and r.workspace_id is null;
update public.monetization_entries r set workspace_id=w.id
 from public.channel_workspaces w where r.owner_id=w.owner_id and w.is_default and r.workspace_id is null;
update public.affiliate_partners r set workspace_id=w.id
 from public.channel_workspaces w where r.owner_id=w.owner_id and w.is_default and r.workspace_id is null;
update public.sponsorship_leads r set workspace_id=w.id
 from public.channel_workspaces w where r.owner_id=w.owner_id and w.is_default and r.workspace_id is null;
update public.content_roi_snapshots r set workspace_id=w.id
 from public.channel_workspaces w where r.owner_id=w.owner_id and w.is_default and r.workspace_id is null;
update public.affiliate_performance_daily r set workspace_id=w.id
 from public.channel_workspaces w where r.owner_id=w.owner_id and w.is_default and r.workspace_id is null;

create unique index if not exists content_intelligence_reports_owner_workspace_date_uidx on public.content_intelligence_reports(owner_id,workspace_id,report_date);
create index if not exists content_intelligence_workspace_date_idx on public.content_intelligence_reports(owner_id,workspace_id,report_date desc);
create index if not exists monetization_workspace_date_idx on public.monetization_entries(owner_id,workspace_id,entry_date desc);
create index if not exists content_roi_workspace_date_idx on public.content_roi_snapshots(owner_id,workspace_id,snapshot_date desc);

alter table public.content_opportunity_scores enable row level security;
alter table public.scene_asset_jobs enable row level security;
alter table public.platform_analytics_imports enable row level security;
drop policy if exists owner_scope_all on public.content_opportunity_scores;
create policy owner_scope_all on public.content_opportunity_scores for all to authenticated
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));
drop policy if exists owner_scope_all on public.scene_asset_jobs;
create policy owner_scope_all on public.scene_asset_jobs for all to authenticated
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));
drop policy if exists owner_scope_all on public.platform_analytics_imports;
create policy owner_scope_all on public.platform_analytics_imports for all to authenticated
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));

-- Preserve existing records while assigning the owner's default workspace.
do $$
begin
 if to_regclass('public.publishing_targets') is not null then
  update public.publishing_targets p set channel_workspace_id=w.id
  from public.channel_workspaces w
  where p.owner_id=w.owner_id and w.is_default and p.channel_workspace_id is null;
 end if;
end $$;
