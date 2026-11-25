-- Research-backed Shorts publishing pipeline for AIWithBh@i.
create table if not exists public.content_calendar (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 opportunity_id uuid references public.content_ideas(id) on delete set null,
 title text not null, format text not null default 'short' check(format in ('short')),
 scheduled_date date, status text not null default 'planned' check(status in ('planned','research_ready','script_ready','pending_approval','approved','rejected','published')),
 research_confidence integer not null default 0 check(research_confidence between 0 and 100),
 script_confidence integer not null default 0 check(script_confidence between 0 and 100),
 target_duration_seconds integer not null default 55 check(target_duration_seconds between 50 and 60),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.content_research_briefs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 calendar_id uuid not null references public.content_calendar(id) on delete cascade,
 research_snapshot jsonb not null default '{}'::jsonb,
 source_references jsonb not null default '[]'::jsonb,
 competitor_insights jsonb not null default '[]'::jsonb,
 trend_insights jsonb not null default '[]'::jsonb,
 content_gaps jsonb not null default '[]'::jsonb,
 differentiation_strategy text, confidence_score integer not null default 0 check(confidence_score between 0 and 100),
 created_at timestamptz not null default now()
);
create table if not exists public.content_scripts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 calendar_id uuid not null references public.content_calendar(id) on delete cascade,
 version integer not null default 1, outline jsonb not null default '[]'::jsonb,
 script text not null, hook text, curiosity_loops jsonb not null default '[]'::jsonb,
 word_count integer not null default 0, estimated_duration_seconds integer not null default 0,
 quality_confidence integer not null default 0 check(quality_confidence between 0 and 100),
 provider text, status text not null default 'draft', created_at timestamptz not null default now(),
 unique(calendar_id,version)
);
create table if not exists public.content_approvals (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 calendar_id uuid not null references public.content_calendar(id) on delete cascade,
 item_type text not null, decision text not null check(decision in ('approved','rejected','changes_requested')),
 comments text, created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['content_calendar','content_research_briefs','content_scripts','content_approvals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists owner_all on public.%I',t);
  execute format('create policy owner_all on public.%I for all using(owner_id=auth.uid()) with check(owner_id=auth.uid())',t);
 end loop;
end $$;
create index if not exists content_calendar_owner_date_idx on public.content_calendar(owner_id,scheduled_date);
create index if not exists content_research_briefs_calendar_idx on public.content_research_briefs(calendar_id,created_at desc);
create index if not exists content_scripts_calendar_idx on public.content_scripts(calendar_id,version desc);
create index if not exists content_approvals_calendar_idx on public.content_approvals(calendar_id,created_at desc);
