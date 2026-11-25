-- Shared, platform-neutral Channel Preparation rotation. Reads saved shortlist records only.
create table if not exists public.social_research_queue_history (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 platform text not null check(platform in ('youtube','instagram')),
 social_video_id uuid references public.social_videos(id) on delete set null,
 competitor_id uuid references public.competitors(id) on delete set null,
 channel_id text,
 channel_title text not null,
 channel_url text,
 video_id text not null,
 video_title text not null,
 video_url text not null,
 thumbnail_url text,
 selected_at timestamptz not null default now()
);
create index if not exists social_research_queue_owner_selected_idx on public.social_research_queue_history(owner_id,selected_at desc);
alter table public.social_research_queue_history enable row level security;
drop policy if exists social_research_queue_owner_read on public.social_research_queue_history;
create policy social_research_queue_owner_read on public.social_research_queue_history for select to authenticated using(owner_id=auth.uid());
grant select on public.social_research_queue_history to authenticated;

create or replace function public.rotate_social_research_queue()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid; v_pick record;
begin
 for v_owner in
  select owner_id from public.video_shortlists group by owner_id
  union
  select owner_id from public.competitors where is_active=true and ai_production_status='qualified' and ai_production_evidence is not null
 loop
  with candidates as (
   select 'youtube'::text platform,null::uuid social_video_id,c.id competitor_id,c.youtube_channel_id channel_id,
    coalesce(nullif(c.channel_title,''),'Shortlisted YouTube channel') channel_title,c.channel_url,
    v.item->>'videoId' video_id,coalesce(nullif(v.item->>'title',''),'Untitled video') video_title,
    'https://www.youtube.com/watch?v='||(v.item->>'videoId') video_url,nullif(v.item->>'thumbnailUrl','') thumbnail_url
   from public.competitors c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.ai_production_evidence->'sampleVideos')='array' then c.ai_production_evidence->'sampleVideos' else '[]'::jsonb end) v(item)
   where c.owner_id=v_owner and c.is_active=true and c.ai_production_status='qualified'
    and coalesce(v.item->>'videoId','') ~ '^[A-Za-z0-9_-]{11}$'
   union all
   select sv.platform,sv.id,null::uuid,sv.source_channel_id,coalesce(nullif(sv.source_channel_name,''),'Shortlisted '||sv.platform||' channel'),
    sv.source_channel_url,sv.external_video_id,sv.title,sv.permalink,sv.thumbnail_url
   from public.video_shortlists vs join public.social_videos sv on sv.id=vs.social_video_id and sv.owner_id=vs.owner_id
   where vs.owner_id=v_owner
  )
  select c.* into v_pick from candidates c
  where not exists(select 1 from public.social_research_queue_history h where h.owner_id=v_owner and h.platform=c.platform and h.video_id=c.video_id and h.selected_at>=now()-interval '5 days')
  order by random() limit 1;
  if not found then
   with candidates as (
    select 'youtube'::text platform,null::uuid social_video_id,c.id competitor_id,c.youtube_channel_id channel_id,
     coalesce(nullif(c.channel_title,''),'Shortlisted YouTube channel') channel_title,c.channel_url,
     v.item->>'videoId' video_id,coalesce(nullif(v.item->>'title',''),'Untitled video') video_title,
     'https://www.youtube.com/watch?v='||(v.item->>'videoId') video_url,nullif(v.item->>'thumbnailUrl','') thumbnail_url
    from public.competitors c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.ai_production_evidence->'sampleVideos')='array' then c.ai_production_evidence->'sampleVideos' else '[]'::jsonb end) v(item)
    where c.owner_id=v_owner and c.is_active=true and c.ai_production_status='qualified' and coalesce(v.item->>'videoId','') ~ '^[A-Za-z0-9_-]{11}$'
    union all
    select sv.platform,sv.id,null::uuid,sv.source_channel_id,coalesce(nullif(sv.source_channel_name,''),'Shortlisted '||sv.platform||' channel'),
     sv.source_channel_url,sv.external_video_id,sv.title,sv.permalink,sv.thumbnail_url
    from public.video_shortlists vs join public.social_videos sv on sv.id=vs.social_video_id and sv.owner_id=vs.owner_id where vs.owner_id=v_owner
   )
   select c.* into v_pick from candidates c order by random() limit 1;
  end if;
  if found then
   insert into public.social_research_queue_history(owner_id,platform,social_video_id,competitor_id,channel_id,channel_title,channel_url,video_id,video_title,video_url,thumbnail_url,selected_at)
   values(v_owner,v_pick.platform,v_pick.social_video_id,v_pick.competitor_id,v_pick.channel_id,v_pick.channel_title,v_pick.channel_url,v_pick.video_id,v_pick.video_title,v_pick.video_url,v_pick.thumbnail_url,now());
  end if;
 end loop;
 delete from public.social_research_queue_history where selected_at<now()-interval '30 days';
end; $$;
revoke all on function public.rotate_social_research_queue() from public,anon,authenticated;
select cron.unschedule(jobid) from cron.job where jobname='aiwithbhai-channel-preparation-every-10-minutes';\nselect cron.schedule('aiwithbhai-social-channel-preparation-every-10-minutes','*/10 * * * *','select public.rotate_social_research_queue();');
select public.rotate_social_research_queue();
