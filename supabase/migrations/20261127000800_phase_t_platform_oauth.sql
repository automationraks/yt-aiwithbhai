-- Phase T: workspace-scoped platform OAuth credentials and account links.
alter table public.instagram_connections add column if not exists workspace_id uuid;
update public.instagram_connections ic set workspace_id=w.id
 from public.channel_workspaces w where w.owner_id=ic.owner_id and w.is_default=true and ic.workspace_id is null;
update public.instagram_connections ic set workspace_id=w.id
 from public.channel_workspaces w where w.owner_id=ic.owner_id and ic.workspace_id is null
 and w.id=(select id from public.channel_workspaces w2 where w2.owner_id=ic.owner_id and w2.is_active order by created_at limit 1);
alter table public.instagram_connections alter column workspace_id set not null;
do $$
declare c record;
begin
 for c in select conname from pg_constraint where conrelid='public.instagram_connections'::regclass and contype='u'
 loop execute format('alter table public.instagram_connections drop constraint %I',c.conname); end loop;
end $$;
alter table public.instagram_connections add constraint instagram_connections_workspace_owner_fkey
 foreign key(workspace_id,owner_id) references public.channel_workspaces(id,owner_id) on delete cascade;
create unique index if not exists instagram_connections_workspace_uidx on public.instagram_connections(workspace_id);
create index if not exists instagram_connections_owner_workspace_idx on public.instagram_connections(owner_id,workspace_id);

create table if not exists public.youtube_connections (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.app_users(id) on delete cascade,
 workspace_id uuid not null,
 channel_id text not null,
 channel_title text,
 channel_handle text,
 encrypted_access_token text not null,
 encrypted_refresh_token text,
 token_expires_at timestamptz,
 scopes text[] not null default '{}',
 connection_status text not null default 'connected' check(connection_status in ('connected','expired','error')),
 last_verified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,owner_id) references public.channel_workspaces(id,owner_id) on delete cascade,
 unique(workspace_id),
 unique(workspace_id,channel_id)
);
alter table public.youtube_connections enable row level security;
drop policy if exists youtube_connections_owner_all on public.youtube_connections;
create policy youtube_connections_owner_all on public.youtube_connections for all
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));
alter table public.instagram_connections enable row level security;
drop policy if exists instagram_connection_owner on public.instagram_connections;
drop policy if exists instagram_connection_workspace_owner on public.instagram_connections;
create policy instagram_connection_workspace_owner on public.instagram_connections for all
 using(owner_id=(select id from public.app_users where id=auth.uid()))
 with check(owner_id=(select id from public.app_users where id=auth.uid()));

create or replace function public.touch_platform_connection_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists youtube_connections_updated_at on public.youtube_connections;
create trigger youtube_connections_updated_at before update on public.youtube_connections
 for each row execute function public.touch_platform_connection_updated_at();
