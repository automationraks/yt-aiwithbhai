-- Replace Supabase Auth as the application's identity provider.
-- Existing auth user UUIDs are retained so existing owner_id data remains associated.

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text,
  display_name text,
  role text not null default 'owner' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.app_sessions (
  token_hash text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists app_sessions_user_idx on public.app_sessions(user_id);
create index if not exists app_sessions_expiry_idx on public.app_sessions(expires_at);

-- Preserve existing owner UUIDs and email addresses; users set a new app password
-- through the one-time setup flow. No Supabase Auth password or token is reused.
do $$
begin
  if to_regclass('auth.users') is not null then
    insert into public.app_users (id, email, display_name)
    select id, lower(email), coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')
    from auth.users
    where email is not null
    on conflict (id) do nothing;
  end if;
end $$;

-- The server now uses the service-role database client after validating its own
-- session cookie. Remove auth.users foreign keys; owner_id UUID values are retained.
do $$
declare item record;
begin
  for item in
    select ns.nspname as schema_name, rel.relname as table_name, con.conname as constraint_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and ns.nspname = 'public'
  loop
    execute format('alter table %I.%I drop constraint %I',
      item.schema_name, item.table_name, item.constraint_name);
  end loop;
end $$;

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
revoke all on public.app_users, public.app_sessions from anon, authenticated;
grant all on public.app_users, public.app_sessions to service_role;

create or replace function public.register_first_app_user(
  p_email text,
  p_password_hash text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_existing_count integer;
begin
  if p_email is null or length(trim(p_email)) < 5 or p_password_hash is null
     or length(p_password_hash) < 40 then
    raise exception 'INVALID_REGISTRATION';
  end if;

  select count(*) into v_existing_count
  from public.app_users where password_hash is not null;
  if v_existing_count > 0 then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  select id into v_user_id
  from public.app_users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is not null then
    update public.app_users
      set password_hash = p_password_hash,
          display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
          updated_at = now()
    where id = v_user_id and password_hash is null;
    if not found then raise exception 'REGISTRATION_CLOSED'; end if;
  else
    if exists (select 1 from public.app_users) then
      raise exception 'EMAIL_NOT_ELIGIBLE';
    end if;
    insert into public.app_users(email, password_hash, display_name, role)
      values (lower(trim(p_email)), p_password_hash, nullif(trim(p_display_name), ''), 'owner')
      returning id into v_user_id;
  end if;
  return v_user_id;
end;
$$;

revoke all on function public.register_first_app_user(text,text,text) from public, anon, authenticated;
grant execute on function public.register_first_app_user(text,text,text) to service_role;

-- The quota RPCs are now server-only. Authentication is enforced by the
-- application session middleware before the service-role client calls them.
create or replace function public.reserve_youtube_quota(
  p_bucket text,
  p_amount integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'America/Los_Angeles')::date;
  v_used integer;
  v_limit integer;
  v_next integer;
  v_reset timestamptz;
begin
  if p_bucket not in ('search', 'general') or p_amount < 1 or p_amount > 100 then
    raise exception 'Invalid quota reservation';
  end if;
  insert into public.youtube_quota_usage (quota_date) values (v_date)
  on conflict (quota_date) do nothing;
  select case when p_bucket = 'search' then search_requests_used else general_units_used end
    into v_used from public.youtube_quota_usage where quota_date = v_date for update;
  v_limit := case when p_bucket = 'search' then 100 else 10000 end;
  v_next := v_used + p_amount;
  v_reset := ((v_date + 1)::timestamp at time zone 'America/Los_Angeles');
  if v_next > v_limit then
    return jsonb_build_object('allowed', false, 'bucket', p_bucket, 'used', v_used,
      'limit', v_limit, 'remaining', greatest(0, v_limit - v_used), 'resetAt', v_reset, 'quotaDate', v_date);
  end if;
  if p_bucket = 'search' then
    update public.youtube_quota_usage set search_requests_used = v_next, updated_at = now() where quota_date = v_date;
  else
    update public.youtube_quota_usage set general_units_used = v_next, updated_at = now() where quota_date = v_date;
  end if;
  return jsonb_build_object('allowed', true, 'bucket', p_bucket, 'used', v_next,
    'limit', v_limit, 'remaining', v_limit - v_next, 'resetAt', v_reset, 'quotaDate', v_date);
end;
$$;

create or replace function public.get_youtube_quota_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'America/Los_Angeles')::date;
  v_search integer := 0;
  v_general integer := 0;
  v_reset timestamptz;
begin
  select search_requests_used, general_units_used into v_search, v_general
  from public.youtube_quota_usage where quota_date = v_date;
  v_search := coalesce(v_search, 0);
  v_general := coalesce(v_general, 0);
  v_reset := ((v_date + 1)::timestamp at time zone 'America/Los_Angeles');
  return jsonb_build_object('quotaDate', v_date, 'timezone', 'America/Los_Angeles',
    'resetAt', v_reset,
    'search', jsonb_build_object('used', v_search, 'limit', 100, 'remaining', greatest(0, 100 - v_search)),
    'general', jsonb_build_object('used', v_general, 'limit', 10000, 'remaining', greatest(0, 10000 - v_general)));
end;
$$;

revoke all on function public.reserve_youtube_quota(text, integer) from public, anon, authenticated;
revoke all on function public.get_youtube_quota_status() from public, anon, authenticated;
grant execute on function public.reserve_youtube_quota(text, integer) to service_role;
grant execute on function public.get_youtube_quota_status() to service_role;
