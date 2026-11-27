-- Phase J: monetization ledger, affiliate/sponsor pipeline and content ROI.
-- Phase K: multi-channel workspaces, account registry and scoped automation settings.

create table if not exists public.monetization_entries (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 idea_id uuid references public.content_ideas(id) on delete set null,
 platform text check (platform in ('youtube','instagram','affiliate','sponsorship','other')),
 revenue_type text not null check (revenue_type in ('ad_revenue','affiliate','sponsorship','product','other')),
 amount numeric(14,2) not null check (amount >= 0),
 currency text not null default 'INR' check (currency in ('INR','USD','EUR','GBP')),
 entry_date date not null default current_date,
 source_name text,
 notes text,
 created_at timestamptz not null default now()
);
create index if not exists monetization_entries_owner_date_idx on public.monetization_entries(owner_id,entry_date desc);

create table if not exists public.affiliate_partners (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 partner_name text not null,
 product_name text not null,
 destination_url text not null,
 affiliate_url text,
 commission_rate numeric(7,3) check (commission_rate between 0 and 100),
 currency text not null default 'INR' check (currency in ('INR','USD','EUR','GBP')),
 status text not null default 'researching' check (status in ('researching','applied','approved','active','paused','rejected')),
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists affiliate_partners_owner_status_idx on public.affiliate_partners(owner_id,status);

create table if not exists public.affiliate_performance_daily (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 partner_id uuid not null references public.affiliate_partners(id) on delete cascade,
 report_date date not null default current_date,
 clicks integer not null default 0 check (clicks >= 0),
 conversions integer not null default 0 check (conversions >= 0),
 revenue numeric(14,2) not null default 0 check (revenue >= 0),
 currency text not null default 'INR' check (currency in ('INR','USD','EUR','GBP')),
 created_at timestamptz not null default now(),
 unique(owner_id,partner_id,report_date)
);
create index if not exists affiliate_performance_owner_date_idx on public.affiliate_performance_daily(owner_id,report_date desc);

create table if not exists public.sponsorship_leads (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 brand_name text not null,
 contact_name text,
 contact_email text,
 website_url text,
 campaign_brief text,
 estimated_value numeric(14,2) check (estimated_value is null or estimated_value >= 0),
 currency text not null default 'INR' check (currency in ('INR','USD','EUR','GBP')),
 stage text not null default 'identified' check (stage in ('identified','contacted','negotiating','accepted','declined','completed')),
 follow_up_at timestamptz,
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists sponsorship_leads_owner_stage_idx on public.sponsorship_leads(owner_id,stage);

create table if not exists public.content_roi_snapshots (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 idea_id uuid not null references public.content_ideas(id) on delete cascade,
 platform text not null check (platform in ('youtube','instagram')),
 snapshot_date date not null default current_date,
 views bigint not null default 0 check (views >= 0),
 estimated_rpm numeric(12,4) not null default 0 check (estimated_rpm >= 0),
 estimated_ad_revenue numeric(14,2) not null default 0 check (estimated_ad_revenue >= 0),
 actual_revenue numeric(14,2) not null default 0 check (actual_revenue >= 0),
 affiliate_revenue numeric(14,2) not null default 0 check (affiliate_revenue >= 0),
 sponsorship_revenue numeric(14,2) not null default 0 check (sponsorship_revenue >= 0),
 production_cost numeric(14,2) not null default 0 check (production_cost >= 0),
 currency text not null default 'INR' check (currency in ('INR','USD','EUR','GBP')),
 created_at timestamptz not null default now(),
 unique(owner_id,idea_id,platform,snapshot_date)
);
create index if not exists content_roi_owner_date_idx on public.content_roi_snapshots(owner_id,snapshot_date desc);

-- A workspace represents one content brand/channel operation. Account credentials are
-- deliberately not stored here; OAuth tokens remain in the existing encrypted connection tables.
create table if not exists public.channel_workspaces (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 name text not null,
 slug text not null,
 description text,
 timezone text not null default 'Asia/Kolkata',
 is_default boolean not null default false,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,slug),
 unique(id,owner_id)
);
create unique index if not exists channel_workspaces_one_default_idx on public.channel_workspaces(owner_id) where is_default;

create table if not exists public.channel_accounts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null,
 platform text not null check (platform in ('youtube','instagram')),
 account_name text not null,
 handle text,
 external_account_id text,
 profile_url text,
 connection_status text not null default 'not_connected' check (connection_status in ('not_connected','connected','expired','error')),
 last_verified_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,owner_id) references public.channel_workspaces(id,owner_id) on delete restrict,
 unique(workspace_id,platform,external_account_id)
);
create index if not exists channel_accounts_owner_workspace_idx on public.channel_accounts(owner_id,workspace_id,platform);

create table if not exists public.workspace_automation_settings (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null,
 setting_key text not null,
 enabled boolean not null default true,
 setting_value jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,owner_id) references public.channel_workspaces(id,owner_id) on delete cascade,
 unique(workspace_id,setting_key)
);
create index if not exists workspace_automation_settings_owner_idx on public.workspace_automation_settings(owner_id,workspace_id);

create table if not exists public.channel_account_metric_snapshots (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null,
 account_id uuid not null,
 snapshot_date date not null,
 followers bigint,
 subscribers bigint,
 total_views bigint,
 media_count bigint,
 recent_views bigint,
 recent_likes bigint,
 recent_comments bigint,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,owner_id) references public.channel_workspaces(id,owner_id) on delete cascade,
 foreign key(account_id) references public.channel_accounts(id) on delete cascade,
 unique(account_id,snapshot_date)
);
create index if not exists channel_account_metrics_workspace_date_idx on public.channel_account_metric_snapshots(owner_id,workspace_id,snapshot_date desc);

alter table public.content_ideas add column if not exists channel_workspace_id uuid;
alter table public.content_ideas drop constraint if exists content_ideas_channel_workspace_owner_fkey;
alter table public.content_ideas add constraint content_ideas_channel_workspace_owner_fkey
 foreign key(channel_workspace_id,owner_id) references public.channel_workspaces(id,owner_id) on delete restrict;
create index if not exists content_ideas_workspace_idx on public.content_ideas(owner_id,channel_workspace_id,created_at desc);

alter table public.publishing_targets add column if not exists channel_workspace_id uuid;
alter table public.publishing_targets drop constraint if exists publishing_targets_channel_workspace_owner_fkey;
alter table public.publishing_targets add constraint publishing_targets_channel_workspace_owner_fkey
 foreign key(channel_workspace_id,owner_id) references public.channel_workspaces(id,owner_id) on delete set null;
create index if not exists publishing_targets_workspace_schedule_idx on public.publishing_targets(owner_id,channel_workspace_id,scheduled_at);

-- Preserve the existing single-channel setup as each owner's initial workspace.
insert into public.channel_workspaces(owner_id,name,slug,description,timezone,is_default)
select u.id,'AIWithBh@i','aiwithbhai','Migrated default workspace','Asia/Kolkata',true
from public.app_users u
where not exists (select 1 from public.channel_workspaces w where w.owner_id=u.id)
on conflict(owner_id,slug) do nothing;

update public.content_ideas i
set channel_workspace_id=w.id
from public.channel_workspaces w
where i.owner_id=w.owner_id and w.is_default and i.channel_workspace_id is null;

update public.publishing_targets p
set channel_workspace_id=w.id
from public.channel_workspaces w
where p.owner_id=w.owner_id and w.is_default and p.channel_workspace_id is null;

-- All writes are performed through the authenticated application session and server-side DB client.
-- RLS remains enabled as defence in depth for direct database access.
do $$
declare t text;
begin
 foreach t in array array['monetization_entries','affiliate_partners','affiliate_performance_daily','sponsorship_leads','content_roi_snapshots','channel_workspaces','channel_accounts','workspace_automation_settings','channel_account_metric_snapshots']
 loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists owner_scope_all on public.%I',t);
  execute format('create policy owner_scope_all on public.%I for all to authenticated using (owner_id = (select id from public.app_users where id = auth.uid())) with check (owner_id = (select id from public.app_users where id = auth.uid()))',t);
 end loop;
end $$;
