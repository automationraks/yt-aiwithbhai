-- Phase R/S: complete core workspace ownership and cloud scene-image worker support.
alter table public.competitors add column if not exists workspace_id uuid;
update public.competitors c
   set workspace_id = w.id
  from public.channel_workspaces w
 where c.owner_id = w.owner_id and w.is_default = true and c.workspace_id is null;
update public.competitors c
   set workspace_id = w.id
  from public.channel_workspaces w
 where c.owner_id = w.owner_id and c.workspace_id is null
   and w.id = (select w2.id from public.channel_workspaces w2 where w2.owner_id=c.owner_id and w2.is_active=true order by w2.created_at limit 1);

do $$
begin
 if not exists(select 1 from pg_constraint where conname='competitors_workspace_owner_fkey' and conrelid='public.competitors'::regclass) then
  alter table public.competitors add constraint competitors_workspace_owner_fkey
   foreign key(workspace_id,owner_id) references public.channel_workspaces(id,owner_id) on delete cascade;
 end if;
end $$;
create index if not exists competitors_workspace_active_idx on public.competitors(owner_id,workspace_id,is_active,subscriber_count desc);

alter table public.content_calendar add column if not exists workspace_id uuid;
update public.content_calendar c
   set workspace_id = w.id
  from public.channel_workspaces w
 where c.owner_id = w.owner_id and w.is_default = true and c.workspace_id is null;
update public.content_calendar c
   set workspace_id = w.id
  from public.channel_workspaces w
 where c.owner_id = w.owner_id and c.workspace_id is null
   and w.id = (select w2.id from public.channel_workspaces w2 where w2.owner_id=c.owner_id and w2.is_active=true order by w2.created_at limit 1);

do $$
begin
 if not exists(select 1 from pg_constraint where conname='content_calendar_workspace_owner_fkey' and conrelid='public.content_calendar'::regclass) then
  alter table public.content_calendar add constraint content_calendar_workspace_owner_fkey
   foreign key(workspace_id,owner_id) references public.channel_workspaces(id,owner_id) on delete cascade;
 end if;
end $$;
create index if not exists content_calendar_workspace_schedule_idx on public.content_calendar(owner_id,workspace_id,scheduled_date);

alter table public.scene_asset_jobs
 add column if not exists claimed_by text,
 add column if not exists lease_expires_at timestamptz,
 add column if not exists attempts integer not null default 0,
 add column if not exists max_attempts integer not null default 3;
create index if not exists scene_asset_jobs_lease_idx on public.scene_asset_jobs(status,lease_expires_at) where status='processing';

create or replace function public.claim_scene_asset_job(p_worker_id text)
returns setof public.scene_asset_jobs
language plpgsql security definer set search_path=public
as $$
begin
 if p_worker_id is null or length(trim(p_worker_id))=0 then raise exception 'worker_id is required'; end if;
 update public.scene_asset_jobs
  set status=case when attempts>=max_attempts then 'failed' else 'queued' end,
      error_message=coalesce(error_message,'Scene asset worker lease expired.'),
      claimed_by=null,lease_expires_at=null,updated_at=now()
  where status='processing' and lease_expires_at is not null and lease_expires_at<now();
 return query
 with candidate as (
  select id from public.scene_asset_jobs
   where status='queued' and attempts<max_attempts
   order by created_at for update skip locked limit 1
 )
 update public.scene_asset_jobs j
  set status='processing',claimed_by=p_worker_id,attempts=j.attempts+1,
      lease_expires_at=now()+interval '10 minutes',updated_at=now()
 from candidate where j.id=candidate.id returning j.*;
end $$;
create or replace function public.heartbeat_scene_asset_job(p_job_id uuid,p_worker_id text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare changed integer;
begin
 update public.scene_asset_jobs set lease_expires_at=now()+interval '10 minutes',updated_at=now()
  where id=p_job_id and status='processing' and claimed_by=p_worker_id;
 get diagnostics changed=row_count; return changed=1;
end $$;
revoke all on function public.claim_scene_asset_job(text) from public,anon,authenticated;
revoke all on function public.heartbeat_scene_asset_job(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_scene_asset_job(text) to service_role;
grant execute on function public.heartbeat_scene_asset_job(uuid,text) to service_role;
