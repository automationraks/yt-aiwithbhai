create extension if not exists pgcrypto;

create table if not exists public.channel_profile (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade unique,
 channel_id text,
 channel_name text not null default 'Industrial Hub',
 language text not null default 'hi',
 niche text not null default 'Industrial manufacturing and engineering',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 setting_key text not null,
 setting_value jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 unique(owner_id,setting_key)
);

create table if not exists public.keyword_library (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 keyword text not null,
 language text not null check(language in ('hi','en')),
 category text,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(owner_id,keyword,language)
);

create table if not exists public.competitors (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 youtube_channel_id text not null,
 channel_title text not null,
 channel_url text,
 description text,
 published_at timestamptz,
 country text,
 language text,
 subscriber_count bigint,
 video_count bigint,
 view_count bigint,
 is_active boolean not null default true,
 discovered_at timestamptz not null default now(),
 last_checked_at timestamptz,
 unique(owner_id,youtube_channel_id)
);
create index if not exists competitors_owner_active_idx on public.competitors(owner_id,is_active);

create table if not exists public.competitor_snapshots (
 id uuid primary key default gen_random_uuid(),
 competitor_id uuid not null references public.competitors(id) on delete cascade,
 subscriber_count bigint,
 video_count bigint,
 view_count bigint,
 captured_at timestamptz not null default now()
);
create index if not exists competitor_snapshots_history_idx on public.competitor_snapshots(competitor_id,captured_at desc);

create table if not exists public.videos (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 competitor_id uuid references public.competitors(id) on delete set null,
 youtube_video_id text not null,
 title text not null,
 description text,
 published_at timestamptz,
 duration_seconds integer,
 view_count bigint,
 like_count bigint,
 comment_count bigint,
 is_short boolean not null default false,
 thumbnail_url text,
 video_url text,
 language text,
 created_at timestamptz not null default now(),
 unique(owner_id,youtube_video_id)
);
create index if not exists videos_owner_published_idx on public.videos(owner_id,published_at desc);

create table if not exists public.video_snapshots (
 id uuid primary key default gen_random_uuid(),
 video_id uuid not null references public.videos(id) on delete cascade,
 view_count bigint,
 like_count bigint,
 comment_count bigint,
 captured_at timestamptz not null default now()
);

create table if not exists public.topic_clusters (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null,
 description text,
 keywords text[] not null default '{}',
 created_at timestamptz not null default now()
);

create table if not exists public.content_ideas (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 hook text,
 outline jsonb not null default '[]'::jsonb,
 format text not null check(format in ('long','short')),
 language text not null default 'hi',
 topic text,
 opportunity_score numeric(5,2),
 source_video_ids text[] not null default '{}',
 status text not null default 'idea' check(status in ('idea','planned','approved','producing','published','rejected')),
 scheduled_for date,
 created_at timestamptz not null default now()
);
create index if not exists content_ideas_owner_status_idx on public.content_ideas(owner_id,status);

create table if not exists public.opportunity_videos (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 video_id uuid references public.videos(id) on delete cascade,
 opportunity_score numeric(5,2),
 reason text,
 detected_at timestamptz not null default now()
);

create table if not exists public.brand_assets (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 asset_type text not null,
 storage_path text,
 prompt text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create table if not exists public.approval_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 action_type text not null,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','executed','failed')),
 requested_at timestamptz not null default now(),
 reviewed_at timestamptz,
 executed_at timestamptz,
 execution_result jsonb
);

create table if not exists public.automation_runs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 workflow_name text not null,
 execution_id text,
 status text not null default 'queued',
 started_at timestamptz,
 finished_at timestamptz,
 items_processed integer not null default 0,
 error_message text,
 metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.alerts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 alert_type text not null,
 title text not null,
 message text,
 payload jsonb not null default '{}'::jsonb,
 is_read boolean not null default false,
 created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null,
 target_type text,
 target_id text,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

-- Enable owner-scoped RLS for primary tables.
do $$
declare t text;
begin
 foreach t in array array['channel_profile','app_settings','keyword_library','competitors','videos','topic_clusters','content_ideas','opportunity_videos','brand_assets','approval_requests','automation_runs','alerts','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists owner_all on public.%I',t);
  execute format('create policy owner_all on public.%I for all using (owner_id=auth.uid()) with check (owner_id=auth.uid())',t);
 end loop;
end $$;

alter table public.competitor_snapshots enable row level security;
drop policy if exists owner_access on public.competitor_snapshots;
create policy owner_access on public.competitor_snapshots for all
 using(exists(select 1 from public.competitors c where c.id=competitor_id and c.owner_id=auth.uid()))
 with check(exists(select 1 from public.competitors c where c.id=competitor_id and c.owner_id=auth.uid()));

alter table public.video_snapshots enable row level security;
drop policy if exists owner_access on public.video_snapshots;
create policy owner_access on public.video_snapshots for all
 using(exists(select 1 from public.videos v where v.id=video_id and v.owner_id=auth.uid()))
 with check(exists(select 1 from public.videos v where v.id=video_id and v.owner_id=auth.uid()));
