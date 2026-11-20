-- AIWithBh@i niche transition: retain historic records but pause legacy industrial-manufacturing candidates.
-- Update the existing channel profile without changing the connected YouTube channel ID.
update public.channel_profile
set
  channel_name = 'AIWithBh@i',
  language = 'en',
  niche = 'AI Systems Architecture and Engineering Education for IT Professionals',
  updated_at = now();

-- Pause legacy industrial/manufacturing seed terms. The new starter-keyword action
-- adds AI systems design, LLM, RAG, agents and production AI terms.
update public.keyword_library
set is_active = false
where lower(coalesce(category,'')) in ('ai faceless format','industrial manufacturing','industrial engineering');

-- Existing competitor records are retained for audit/history but cannot influence the new niche ranking
-- until manually re-reviewed and qualified.
update public.competitors
set
  is_active = false,
  ai_production_status = 'needs_review',
  ai_production_review_note = 'Legacy Industrial Hub candidate. Re-review against AIWithBh@i AI systems architecture and engineering education niche before activation.',
  ai_production_evidence = coalesce(ai_production_evidence, '{}'::jsonb)
    || jsonb_build_object(
      'legacyNiche', 'industrial manufacturing and engineering',
      'reReviewRequired', true,
      'reReviewReason', 'Channel niche changed to AI systems architecture and engineering education for IT professionals.'
    );
