create table if not exists public.manual_tracked_channels (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 platform text not null check(platform in ('youtube','instagram')),
 url text not null, display_name text not null, is_active boolean not null default true,
 created_at timestamptz not null default now(), unique(owner_id,platform,url)
);
alter table public.manual_tracked_channels enable row level security;
drop policy if exists owner_all on public.manual_tracked_channels;
create policy owner_all on public.manual_tracked_channels for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create index if not exists manual_tracked_channels_owner_idx on public.manual_tracked_channels(owner_id,platform,is_active);
