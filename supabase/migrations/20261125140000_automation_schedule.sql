create table if not exists public.automation_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.app_users(id) on delete cascade,
  schedule_key text not null default 'daily_content_research',
  schedule_time text not null default '12:00' check (schedule_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text not null default 'Asia/Kolkata' check (timezone = 'Asia/Kolkata'),
  enabled boolean not null default true,
  last_dispatched_on date,
  dispatching_on date,
  updated_at timestamptz not null default now()
);
create index if not exists automation_schedules_enabled_idx on public.automation_schedules(enabled);
alter table public.automation_schedules enable row level security;
drop policy if exists automation_schedules_owner_read on public.automation_schedules;
create policy automation_schedules_owner_read on public.automation_schedules for select to authenticated using (owner_id = auth.uid());

create or replace function public.claim_daily_content_schedule(p_schedule_id uuid, p_local_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.automation_schedules
     set dispatching_on = p_local_date, updated_at = now()
   where id = p_schedule_id
     and enabled = true
     and last_dispatched_on is distinct from p_local_date
     and (dispatching_on is null or dispatching_on is distinct from p_local_date);
  return found;
end;
$$;
revoke all on function public.claim_daily_content_schedule(uuid,date) from public, anon, authenticated;
grant execute on function public.claim_daily_content_schedule(uuid,date) to service_role;
