create table if not exists public.workflow_event_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  idea_id uuid references public.content_ideas(id) on delete set null,
  workflow text not null check (workflow in ('idea_generation','video_production')),
  event_key text not null,
  stage text not null,
  status text not null default 'completed' check (status in ('started','completed','failed','skipped','review_required','queued','processing')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workflow_event_logs_owner_created_idx on public.workflow_event_logs(owner_id, created_at desc);
create index if not exists workflow_event_logs_idea_created_idx on public.workflow_event_logs(idea_id, created_at asc);
alter table public.workflow_event_logs enable row level security;
drop policy if exists workflow_event_logs_owner_read on public.workflow_event_logs;
create policy workflow_event_logs_owner_read on public.workflow_event_logs for select to authenticated using (owner_id = auth.uid());
