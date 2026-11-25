-- Per-platform scheduling and publication lifecycle for verified short videos.
create table if not exists public.publishing_targets (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 idea_id uuid not null references public.content_ideas(id) on delete cascade,
 platform text not null check(platform in ('youtube','instagram')),
 scheduled_at timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','publishing','published','failed','cancelled')),
 dispatch_status text not null default 'pending' check(dispatch_status in ('pending','sent','failed','not_configured')),
 platform_post_id text,
 published_url text,
 published_at timestamptz,
 error_message text,
 dispatch_attempted_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,idea_id,platform)
);
create index if not exists publishing_targets_owner_schedule_idx on public.publishing_targets(owner_id,scheduled_at);
create index if not exists publishing_targets_due_idx on public.publishing_targets(status,dispatch_status,scheduled_at);
alter table public.publishing_targets enable row level security;
drop policy if exists publishing_targets_owner_all on public.publishing_targets;
create policy publishing_targets_owner_all on public.publishing_targets for all using(owner_id=(select id from public.app_users where id=auth.uid())) with check(owner_id=(select id from public.app_users where id=auth.uid()));
