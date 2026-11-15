-- Add evidence-based AI-production qualification to competitor records.
alter table public.competitors
  add column if not exists ai_production_status text not null default 'needs_review'
    check (ai_production_status in ('needs_review','qualified','rejected')),
  add column if not exists ai_production_evidence jsonb not null default '{}'::jsonb,
  add column if not exists ai_production_reviewed_at timestamptz,
  add column if not exists ai_production_review_note text;

-- Existing channels are deliberately not treated as AI-produced.
update public.competitors
set ai_production_status = 'needs_review'
where ai_production_status is null;
