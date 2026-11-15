# Industrial Hub

Hindi-first research and operations dashboard for an industrial manufacturing and engineering YouTube channel.

## YouTube API quota setup

After pulling the latest code, open the Supabase project SQL Editor and run:

`supabase/migrations/20261115_youtube_quota_management.sql`

This creates a project-wide daily usage counter and two authenticated RPC functions used by the dashboard:
- `get_youtube_quota_status()` reads today's tracked usage.
- `reserve_youtube_quota(bucket, amount)` atomically reserves quota before an API request.

The tracker enforces the documented default buckets:
- `search.list`: 100 requests per day.
- Other Data API endpoints: 10,000 quota units per day combined.

The quota day resets at midnight Pacific Time. The dashboard tracks calls made through this application only. Other tools or apps using the same Google Cloud project also consume quota but are not automatically reflected in this counter. Verify actual usage in Google Cloud Console → APIs & Services → YouTube Data API v3 → Quotas.

The discovery endpoint reserves one search request per keyword and one general quota unit per `channels.list` batch. Reservations are conservative: a reservation can remain counted if the outbound request fails after reservation.

## Local development

Install dependencies with `npm install`, copy `.env.example` to `.env.local`, fill in the required server-side credentials, and run `npm run dev`.

## AI-production competitor review

Run `supabase/migrations/20261115_ai_channel_qualification.sql` in the Supabase SQL Editor. Existing competitor rows are moved to `needs_review` and paused. New discovery results are stored as inactive review candidates. Only manually qualified channels become active competitors.

The public YouTube API does not prove that a channel uses AI narration or generated visuals. Review multiple sample videos before qualifying a channel.

## Competitor intelligence

- `POST /api/competitors/intelligence/refresh` refreshes up to 10 active, qualified channels per request.
- The refresh fetches channel statistics and up to five latest uploads per channel, stores video metadata and historical channel/video snapshots.
- `GET /api/competitors/analytics` calculates public-metric growth comparisons, sample-video views, upload spacing and a heuristic momentum score.
- Open `/competitor-analytics` to inspect the ranking and run another refresh batch. The page also shows a weighted AI-production research score: visual-style likelihood 30%, faceless likelihood 20%, narration evidence 20%, industrial relevance 15%, upload consistency 10%, and public growth 5%. This is a heuristic for prioritization, not proof that a channel uses AI.
- Growth comparisons require snapshots at least six days apart. Competitor watch time, CTR, revenue and retention are not available through the public Data API.

## Setup checklist

The dashboard reads live setup status for Supabase, configured AI provider keys, YouTube API key, n8n webhook credentials and saved research keywords. The starter keyword action inserts Hindi and English seed terms into `keyword_library`. n8n status currently checks credential configuration only; it does not verify that a scheduled workflow is active.

## AI-assisted candidate screening

Set `GEMINI_API_KEY` for Gemini multimodal screening. Optional model override: `GEMINI_MODEL` (default `gemini-2.5-flash-lite`). Groq text fallback uses `GROQ_API_KEY` and optional `GROQ_MODEL` (default `openai/gpt-oss-120b`).

In Competitor Explorer, click **AI screen** on a candidate. Gemini evaluates the supplied channel/video metadata and up to three YouTube thumbnails; Groq fallback evaluates text only. Screening scores cover industrial relevance, faceless-format likelihood and visual-style likelihood. The AI result is advisory and does not change qualification status.

Important limits: thumbnails and metadata do not prove that visuals were AI-generated. Synthetic narration cannot be verified without audio or reliable creator disclosure. Review the actual videos before manually qualifying a channel. The screening endpoint only processes candidates already stored for the signed-in owner.


## Code validation

GitHub Actions runs `npm ci`, `npm run typecheck`, `npm run lint` and `npm run build` on pushes and pull requests to `main`. Check the Actions tab for the result before deploying.

## Automation boundary

The dashboard endpoints support manual refresh and reporting inputs. A recurring weekly schedule and alerts require an active n8n Cloud workflow with a configured webhook and secret. Adding credentials to the app does not create or activate that workflow; configure the schedule and connect the webhook in n8n before treating monitoring as automated.
