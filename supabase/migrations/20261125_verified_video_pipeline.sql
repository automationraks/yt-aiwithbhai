-- Verified short-video production: approved script snapshots, ordered clips, transcript validation and notifications.
alter table public.content_ideas
  add column if not exists approved_script_snapshot text,
  add column if not exists approved_script_hash text,
  add column if not exists video_transcript text,
  add column if not exists video_storage_path text,
  add column if not exists video_segments jsonb not null default '[]'::jsonb,
  add column if not exists video_verification jsonb not null default '{}'::jsonb,
  add column if not exists video_completed_at timestamptz;

alter table public.content_ideas
  drop constraint if exists content_ideas_video_production_status_check;
alter table public.content_ideas
  add constraint content_ideas_video_production_status_check
  check (video_production_status in ('not_started','queued','processing','ready','failed','review_required'));

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  notification_type text not null,
  title text not null,
  message text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_notifications_owner_created_idx
  on public.app_notifications(owner_id, created_at desc);
alter table public.app_notifications enable row level security;
drop policy if exists app_notifications_owner_all on public.app_notifications;
create policy app_notifications_owner_all on public.app_notifications
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-videos', 'generated-videos', false, 524288000, array['video/mp4','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
