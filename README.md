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
