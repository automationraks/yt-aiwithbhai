-- Persist discovery results and user decisions for Creator Explorer.
alter table public.competitors
 add column if not exists discovery_count integer not null default 0,
 add column if not exists last_discovered_at timestamptz,
 add column if not exists discovery_eligibility text not null default 'pending_screen'
   check (discovery_eligibility in ('eligible','filtered','pending_screen')),
 add column if not exists discovery_reason text,
 add column if not exists discovery_score integer check (discovery_score between 0 and 100),
 add column if not exists user_tracking_preference boolean not null default false,
 add column if not exists last_user_action text,
 add column if not exists last_user_action_at timestamptz;

update public.competitors set user_tracking_preference = true where is_active = true;

create table if not exists public.competitor_action_log (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 competitor_id uuid not null references public.competitors(id) on delete cascade,
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists competitor_action_log_owner_created_idx on public.competitor_action_log(owner_id, created_at desc);
create index if not exists competitors_owner_discovery_idx on public.competitors(owner_id, discovery_eligibility, last_discovered_at desc);
alter table public.competitor_action_log enable row level security;
drop policy if exists competitor_action_log_owner_all on public.competitor_action_log;
create policy competitor_action_log_owner_all on public.competitor_action_log for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
