-- Durable queue between n8n Cloud and the outbound-polling Windows renderer.
create table if not exists public.video_render_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 idea_id uuid not null references public.content_ideas(id) on delete cascade,
 script_hash text not null,
 status text not null default 'queued' check(status in ('queued','processing','completed','failed')),
 payload jsonb not null,
 result jsonb not null default '{}'::jsonb,
 error text,
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 started_at timestamptz,
 completed_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(idea_id,script_hash)
);
create index if not exists video_render_jobs_queue_idx on public.video_render_jobs(status,created_at) where status='queued';
alter table public.video_render_jobs enable row level security;
-- No browser policies by design. Only the server-side service-role key may access this queue.
