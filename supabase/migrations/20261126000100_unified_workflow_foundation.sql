create table if not exists public.ai_usage_logs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_users(id) on delete cascade,
 idea_id uuid references public.content_ideas(id) on delete set null, task text not null, provider text not null, model text not null,
 input_tokens integer not null default 0 check(input_tokens>=0), output_tokens integer not null default 0 check(output_tokens>=0),
 total_tokens integer not null default 0 check(total_tokens>=0), estimated_cost_usd numeric(14,8) not null default 0 check(estimated_cost_usd>=0),
 cost_currency text not null default 'USD', cost_is_estimate boolean not null default true, fallback_used boolean not null default false,
 duration_ms integer, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists ai_usage_logs_owner_created_idx on public.ai_usage_logs(owner_id,created_at desc);
alter table public.ai_usage_logs enable row level security;
drop policy if exists ai_usage_logs_owner_read on public.ai_usage_logs;
create policy ai_usage_logs_owner_read on public.ai_usage_logs for select to authenticated using(owner_id=auth.uid());

create table if not exists public.social_videos (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_users(id) on delete cascade,
 platform text not null check(platform in ('youtube','instagram')), external_video_id text not null,
 source_channel_id text, source_channel_name text, source_channel_url text, title text not null, description text,
 permalink text not null, thumbnail_url text, published_at timestamptz, view_count bigint, like_count bigint, comment_count bigint,
 niche_match_score numeric(5,2) check(niche_match_score between 0 and 100), niche_match_reason text,
 is_custom_source boolean not null default false, metadata jsonb not null default '{}'::jsonb,
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 unique(owner_id,platform,external_video_id)
);
create index if not exists social_videos_owner_platform_published_idx on public.social_videos(owner_id,platform,published_at desc);
alter table public.social_videos enable row level security;
drop policy if exists social_videos_owner_all on public.social_videos;
create policy social_videos_owner_all on public.social_videos for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());

create table if not exists public.video_shortlists (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_users(id) on delete cascade,
 social_video_id uuid not null references public.social_videos(id) on delete cascade,
 source_feature text not null check(source_feature in ('instagram_discovery','channel_preparation','manual','competitor_explorer')),
 shortlisted_at timestamptz not null default now(), unique(owner_id,social_video_id)
);
create index if not exists video_shortlists_owner_created_idx on public.video_shortlists(owner_id,shortlisted_at desc);
alter table public.video_shortlists enable row level security;
drop policy if exists video_shortlists_owner_all on public.video_shortlists;
create policy video_shortlists_owner_all on public.video_shortlists for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());

create table if not exists public.publishing_history (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_users(id) on delete cascade, idea_id uuid,
 platform text not null check(platform in ('youtube','instagram')), platform_post_id text, published_url text, published_at timestamptz,
 title text not null, duration_seconds integer, model text, provider text, total_tokens integer not null default 0,
 estimated_cost_usd numeric(14,8) not null default 0, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 unique(owner_id,platform,platform_post_id)
);
create index if not exists publishing_history_owner_date_idx on public.publishing_history(owner_id,published_at desc);
alter table public.publishing_history enable row level security;
drop policy if exists publishing_history_owner_read on public.publishing_history;
create policy publishing_history_owner_read on public.publishing_history for select to authenticated using(owner_id=auth.uid());

create table if not exists public.channel_diagnostics (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_users(id) on delete cascade,
 platform text not null check(platform in ('youtube','instagram','combined')), period_start date not null, period_end date not null,
 metrics jsonb not null default '{}'::jsonb, findings jsonb not null default '[]'::jsonb,
 recommendations jsonb not null default '[]'::jsonb, generated_by text, created_at timestamptz not null default now(),
 unique(owner_id,platform,period_start,period_end)
);
alter table public.channel_diagnostics enable row level security;
drop policy if exists channel_diagnostics_owner_all on public.channel_diagnostics;
create policy channel_diagnostics_owner_all on public.channel_diagnostics for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
