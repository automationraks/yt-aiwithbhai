-- Mark videos that match the AIWithBh@i editorial niche.
alter table public.videos
  add column if not exists is_niche_relevant boolean not null default false,
  add column if not exists niche_relevance_score integer check (niche_relevance_score between 0 and 100),
  add column if not exists niche_relevance_reason text;

create index if not exists videos_owner_niche_published_idx
  on public.videos(owner_id, is_niche_relevant, published_at desc);
