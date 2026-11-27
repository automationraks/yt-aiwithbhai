-- Phase Q: durable competitor alerts and atomic, recoverable render-job leases.
alter table public.video_render_jobs
  add column if not exists claimed_by text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists max_attempts integer not null default 3;

update public.video_render_jobs
   set lease_expires_at = coalesce(started_at, created_at) + interval '2 hours'
 where status = 'processing' and lease_expires_at is null;

create index if not exists video_render_jobs_lease_idx
  on public.video_render_jobs(status, lease_expires_at)
  where status = 'processing';

create or replace function public.claim_video_render_job(p_worker_id text)
returns setof public.video_render_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'worker_id is required';
  end if;

  -- Recover expired leases. Exhausted jobs become failed instead of looping forever.
  update public.video_render_jobs
     set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
         error = case when attempts >= max_attempts
                      then coalesce(error, 'Worker lease expired after maximum attempts.')
                      else coalesce(error, 'Worker lease expired; returned to queue.') end,
         claimed_by = null,
         lease_expires_at = null,
         updated_at = now()
   where status = 'processing'
     and lease_expires_at is not null
     and lease_expires_at < now();

  return query
  with candidate as (
    select id
      from public.video_render_jobs
     where status = 'queued'
       and attempts < max_attempts
     order by created_at asc
     for update skip locked
     limit 1
  )
  update public.video_render_jobs j
     set status = 'processing',
         claimed_by = p_worker_id,
         attempts = j.attempts + 1,
         started_at = now(),
         last_heartbeat_at = now(),
         lease_expires_at = now() + interval '2 hours',
         updated_at = now()
    from candidate
   where j.id = candidate.id
  returning j.*;
end;
$$;

create or replace function public.heartbeat_video_render_job(p_job_id uuid, p_worker_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.video_render_jobs
     set last_heartbeat_at = now(),
         lease_expires_at = now() + interval '2 hours',
         updated_at = now()
   where id = p_job_id
     and status = 'processing'
     and claimed_by = p_worker_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.claim_video_render_job(text) from public, anon, authenticated;
revoke all on function public.heartbeat_video_render_job(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_video_render_job(text) to service_role;
grant execute on function public.heartbeat_video_render_job(uuid, text) to service_role;

create table if not exists public.competitor_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  workspace_id uuid not null,
  alert_key text not null,
  competitor_id uuid,
  alert_type text not null,
  severity text not null check (severity in ('info','warning','positive')),
  title text not null,
  detail text not null,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(owner_id, workspace_id, alert_key),
  foreign key(workspace_id, owner_id)
    references public.channel_workspaces(id, owner_id) on delete cascade
);
create index if not exists competitor_alerts_workspace_recent_idx
  on public.competitor_alerts(owner_id, workspace_id, detected_at desc);
alter table public.competitor_alerts enable row level security;
drop policy if exists competitor_alerts_owner_scope on public.competitor_alerts;
create policy competitor_alerts_owner_scope on public.competitor_alerts
  for all to authenticated
  using (owner_id = (select id from public.app_users where id = auth.uid()))
  with check (owner_id = (select id from public.app_users where id = auth.uid()));
