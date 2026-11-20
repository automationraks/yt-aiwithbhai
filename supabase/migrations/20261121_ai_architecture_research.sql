create table if not exists public.architecture_trends (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 trend_key text not null, title text not null, industry text not null default 'Cross-industry',
 company_examples jsonb not null default '[]'::jsonb, business_problem text, pattern text,
 architecture_flow jsonb not null default '[]'::jsonb, design_considerations jsonb not null default '[]'::jsonb,
 tradeoffs jsonb not null default '[]'::jsonb, source_links jsonb not null default '[]'::jsonb,
 source_video_ids text[] not null default '{}', confidence_score integer not null default 0 check(confidence_score between 0 and 100),
 evidence_note text, generated_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,trend_key)
);
alter table public.content_ideas add column if not exists source_references jsonb not null default '[]'::jsonb;
alter table public.content_ideas add column if not exists idea_key text;
create unique index if not exists content_ideas_owner_idea_key_idx on public.content_ideas(owner_id,idea_key) where idea_key is not null;
alter table public.architecture_trends enable row level security;
drop policy if exists owner_all on public.architecture_trends;
create policy owner_all on public.architecture_trends for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());