-- YouTube Data API quota tracking.
-- Search.list has a separate 100-request/day bucket; other read methods share 10,000 units/day.
-- The counter resets at midnight America/Los_Angeles, matching Google's quota day.

create table if not exists public.youtube_quota_usage (
  quota_date date primary key,
  search_requests_used integer not null default 0 check (search_requests_used >= 0),
  general_units_used integer not null default 0 check (general_units_used >= 0),
  updated_at timestamptz not null default now()
);

alter table public.youtube_quota_usage enable row level security;
-- No direct client policies: authenticated users access this shared project-level counter only via RPC.

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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_bucket not in ('search', 'general') or p_amount < 1 or p_amount > 100 then
    raise exception 'Invalid quota reservation';
  end if;

  insert into public.youtube_quota_usage (quota_date)
  values (v_date)
  on conflict (quota_date) do nothing;

  select
    case when p_bucket = 'search' then search_requests_used else general_units_used end
  into v_used
  from public.youtube_quota_usage
  where quota_date = v_date
  for update;

  v_limit := case when p_bucket = 'search' then 100 else 10000 end;
  v_next := v_used + p_amount;
  v_reset := ((v_date + 1)::timestamp at time zone 'America/Los_Angeles');

  if v_next > v_limit then
    return jsonb_build_object(
      'allowed', false, 'bucket', p_bucket, 'used', v_used,
      'limit', v_limit, 'remaining', greatest(0, v_limit - v_used),
      'resetAt', v_reset, 'quotaDate', v_date
    );
  end if;

  if p_bucket = 'search' then
    update public.youtube_quota_usage
    set search_requests_used = v_next, updated_at = now()
    where quota_date = v_date;
  else
    update public.youtube_quota_usage
    set general_units_used = v_next, updated_at = now()
    where quota_date = v_date;
  end if;

  return jsonb_build_object(
    'allowed', true, 'bucket', p_bucket, 'used', v_next,
    'limit', v_limit, 'remaining', v_limit - v_next,
    'resetAt', v_reset, 'quotaDate', v_date
  );
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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select search_requests_used, general_units_used
  into v_search, v_general
  from public.youtube_quota_usage
  where quota_date = v_date;

  v_search := coalesce(v_search, 0);
  v_general := coalesce(v_general, 0);
  v_reset := ((v_date + 1)::timestamp at time zone 'America/Los_Angeles');

  return jsonb_build_object(
    'quotaDate', v_date,
    'timezone', 'America/Los_Angeles',
    'resetAt', v_reset,
    'search', jsonb_build_object('used', v_search, 'limit', 100, 'remaining', greatest(0, 100 - v_search)),
    'general', jsonb_build_object('used', v_general, 'limit', 10000, 'remaining', greatest(0, 10000 - v_general))
  );
end;
$$;

revoke all on function public.reserve_youtube_quota(text, integer) from public, anon;
revoke all on function public.get_youtube_quota_status() from public, anon;
grant execute on function public.reserve_youtube_quota(text, integer) to authenticated;
grant execute on function public.get_youtube_quota_status() to authenticated;
