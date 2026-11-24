create table if not exists public.instagram_connections (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null unique references auth.users(id) on delete cascade,
 instagram_user_id text not null,
 instagram_username text not null,
 facebook_page_id text not null,
 facebook_page_name text,
 encrypted_page_access_token text not null,
 token_expires_at timestamptz,
 scopes text[] not null default '{}',
 connected_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.instagram_content_sources (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 instagram_media_id text not null,
 source_username text not null,
 source_name text,
 media_type text,
 permalink text not null,
 caption text,
 thumbnail_url text,
 timestamp timestamptz,
 like_count bigint,
 comments_count bigint,
 media_product_type text,
 topic_analysis jsonb not null default '{}'::jsonb,
 content_status text not null default 'discovered' check(content_status in ('discovered','shortlisted','script_created','dismissed')),
 created_at timestamptz not null default now(),
 unique(owner_id,instagram_media_id)
);
alter table public.instagram_connections enable row level security;
alter table public.instagram_content_sources enable row level security;
drop policy if exists instagram_connection_owner on public.instagram_connections;
create policy instagram_connection_owner on public.instagram_connections for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists instagram_sources_owner on public.instagram_content_sources;
create policy instagram_sources_owner on public.instagram_content_sources for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create index if not exists instagram_sources_owner_created_idx on public.instagram_content_sources(owner_id,created_at desc);
create index if not exists instagram_sources_owner_status_idx on public.instagram_content_sources(owner_id,content_status);
