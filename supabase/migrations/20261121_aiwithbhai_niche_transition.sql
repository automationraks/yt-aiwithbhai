-- AIWithBh@i niche transition: retain historic records but pause legacy industrial-manufacturing candidates.
-- Review every saved channel against the new AI systems architecture and engineering education niche.
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
