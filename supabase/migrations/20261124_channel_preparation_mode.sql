-- Cloud Channel Preparation Mode: rotate one random shortlisted sample video per owner every 10 minutes.
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.youtube_research_queue_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  youtube_channel_id text not null,
  channel_title text not null,
  channel_url text,
  video_id text not null,
  video_title text not null,
  video_url text not null,
  thumbnail_url text,
  selected_at timestamptz not null default now()
);

create index if not exists youtube_research_queue_owner_selected_idx
  on public.youtube_research_queue_history(owner_id, selected_at desc);
create index if not exists youtube_research_queue_owner_video_idx
  on public.youtube_research_queue_history(owner_id, video_id, selected_at desc);

alter table public.youtube_research_queue_history enable row level security;
drop policy if exists youtube_research_queue_owner_read on public.youtube_research_queue_history;
create policy youtube_research_queue_owner_read
  on public.youtube_research_queue_history
  for select to authenticated
  using (owner_id = auth.uid());

grant select on public.youtube_research_queue_history to authenticated;

create or replace function public.rotate_youtube_research_queue()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_pick record;
begin
  for v_owner_id in
    select distinct c.owner_id
    from public.competitors c
    where c.is_active = true
      and c.ai_production_status = 'qualified'
      and c.ai_production_evidence is not null
  loop
    -- Prefer videos not selected for this owner in the previous 5 days.
    select
      c.id as competitor_id,
      c.owner_id,
      c.youtube_channel_id,
      coalesce(nullif(c.channel_title, ''), 'Shortlisted channel') as channel_title,
      c.channel_url,
      v.item ->> 'videoId' as video_id,
      coalesce(nullif(v.item ->> 'title', ''), 'Untitled video') as video_title,
      'https://www.youtube.com/watch?v=' || (v.item ->> 'videoId') as video_url,
      nullif(v.item ->> 'thumbnailUrl', '') as thumbnail_url
    into v_pick
    from public.competitors c
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(c.ai_production_evidence -> 'sampleVideos') = 'array'
          then c.ai_production_evidence -> 'sampleVideos'
        else '[]'::jsonb
      end
    ) as v(item)
    where c.owner_id = v_owner_id
      and c.is_active = true
      and c.ai_production_status = 'qualified'
      and c.youtube_channel_id is not null
      and coalesce(v.item ->> 'videoId', '') ~ '^[A-Za-z0-9_-]{11}$'
      and not exists (
        select 1
        from public.youtube_research_queue_history h
        where h.owner_id = v_owner_id
          and h.video_id = v.item ->> 'videoId'
          and h.selected_at >= now() - interval '5 days'
      )
    order by random()
    limit 1;

    -- If every saved sample was selected recently, allow the full shortlist again.
    if not found then
      select
        c.id as competitor_id,
        c.owner_id,
        c.youtube_channel_id,
        coalesce(nullif(c.channel_title, ''), 'Shortlisted channel') as channel_title,
        c.channel_url,
        v.item ->> 'videoId' as video_id,
        coalesce(nullif(v.item ->> 'title', ''), 'Untitled video') as video_title,
        'https://www.youtube.com/watch?v=' || (v.item ->> 'videoId') as video_url,
        nullif(v.item ->> 'thumbnailUrl', '') as thumbnail_url
      into v_pick
      from public.competitors c
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(c.ai_production_evidence -> 'sampleVideos') = 'array'
            then c.ai_production_evidence -> 'sampleVideos'
          else '[]'::jsonb
        end
      ) as v(item)
      where c.owner_id = v_owner_id
        and c.is_active = true
        and c.ai_production_status = 'qualified'
        and c.youtube_channel_id is not null
        and coalesce(v.item ->> 'videoId', '') ~ '^[A-Za-z0-9_-]{11}$'
      order by random()
      limit 1;
    end if;

    if found then
      insert into public.youtube_research_queue_history (
        owner_id, competitor_id, youtube_channel_id, channel_title,
        channel_url, video_id, video_title, video_url, thumbnail_url, selected_at
      ) values (
        v_owner_id, v_pick.competitor_id, v_pick.youtube_channel_id, v_pick.channel_title,
        v_pick.channel_url, v_pick.video_id, v_pick.video_title, v_pick.video_url,
        v_pick.thumbnail_url, now()
      );
    end if;
  end loop;

  delete from public.youtube_research_queue_history
  where selected_at < now() - interval '30 days';
end;
$$;

revoke all on function public.rotate_youtube_research_queue() from public, anon, authenticated;

-- Re-running this migration updates the existing named job rather than duplicating it.
select cron.schedule(
  'aiwithbhai-channel-preparation-every-10-minutes',
  '*/10 * * * *',
  'select public.rotate_youtube_research_queue();'
);

-- Seed the first selection immediately; the scheduled job maintains the 10-minute cadence.
select public.rotate_youtube_research_queue();
