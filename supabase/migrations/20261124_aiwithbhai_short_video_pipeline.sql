-- Daily AIWithBh@i short-form production package and approval pipeline.
alter table public.content_ideas
  add column if not exists script_package jsonb not null default '{}'::jsonb,
  add column if not exists target_duration_seconds integer not null default 35
    check (target_duration_seconds between 30 and 60),
  add column if not exists video_production_status text not null default 'not_started'
    check (video_production_status in ('not_started','queued','processing','ready','failed')),
  add column if not exists video_url text,
  add column if not exists approved_at timestamptz;

-- Older calendar workflow constrained Shorts to 50-60 seconds. The new target is 30-60.
alter table public.content_calendar
  drop constraint if exists content_calendar_target_duration_seconds_check;
alter table public.content_calendar
  add constraint content_calendar_target_duration_seconds_check
  check (target_duration_seconds between 30 and 60);

update public.content_calendar
set target_duration_seconds = 45
where target_duration_seconds < 30 or target_duration_seconds > 60;

create index if not exists content_ideas_owner_status_created_idx
  on public.content_ideas(owner_id, status, created_at desc);
