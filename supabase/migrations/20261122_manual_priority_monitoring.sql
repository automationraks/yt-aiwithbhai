-- Manual YouTube channel priority tracking and daily monitoring metadata.
alter table public.competitors
  add column if not exists is_manual_priority boolean not null default false;

alter table public.manual_tracked_channels
  add column if not exists youtube_channel_id text,
  add column if not exists competitor_id uuid references public.competitors(id) on delete set null,
  add column if not exists monitoring_status text not null default 'not_supported',
  add column if not exists last_checked_at timestamptz,
  add column if not exists next_check_at timestamptz,
  add column if not exists last_error text;

create index if not exists manual_tracked_channels_due_idx
  on public.manual_tracked_channels(platform, is_active, next_check_at)
  where platform = 'youtube' and is_active = true;
create index if not exists competitors_manual_priority_idx
  on public.competitors(owner_id, is_manual_priority, is_active, last_checked_at);

-- Separate service-role-only quota reservation for scheduled jobs.
create or replace function public.reserve_youtube_quota_cron(p_bucket text, p_amount integer default 1)
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
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_bucket not in ('search', 'general') or p_amount < 1 or p_amount > 100 then
    raise exception 'Invalid quota reservation';
  end if;
  insert into public.youtube_quota_usage(quota_date) values(v_date) on conflict do nothing;
  select case when p_bucket='search' then search_requests_used else general_units_used end
    into v_used from public.youtube_quota_usage where quota_date=v_date for update;
  v_limit := case when p_bucket='search' then 100 else 10000 end;
  v_next := v_used + p_amount;
  v_reset := ((v_date + 1)::timestamp at time zone 'America/Los_Angeles');
  if v_next > v_limit then
    return jsonb_build_object('allowed',false,'bucket',p_bucket,'used',v_used,'limit',v_limit,'remaining',greatest(0,v_limit-v_used),'resetAt',v_reset,'quotaDate',v_date);
  end if;
  if p_bucket='search' then
    update public.youtube_quota_usage set search_requests_used=v_next,updated_at=now() where quota_date=v_date;
  else
    update public.youtube_quota_usage set general_units_used=v_next,updated_at=now() where quota_date=v_date;
  end if;
  return jsonb_build_object('allowed',true,'bucket',p_bucket,'used',v_next,'limit',v_limit,'remaining',v_limit-v_next,'resetAt',v_reset,'quotaDate',v_date);
end;
$$;
revoke all on function public.reserve_youtube_quota_cron(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_youtube_quota_cron(text, integer) to service_role;
