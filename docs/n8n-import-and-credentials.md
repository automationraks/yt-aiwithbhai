# n8n import and credentials

Import the two JSON exports from Workflows → Import from File:
- `n8n/daily-content-research.json`
- `n8n/approved-video-production.json`

Both are inactive on import. Replace `https://YOUR-VERCEL-DOMAIN.vercel.app` in the HTTP Request nodes with the deployed `NEXT_PUBLIC_APP_URL`. Replace the same placeholder in the approved-video Code node callback validation.

Create Header Auth credentials:

| Credential | Header | Value |
|---|---|---|
| AIWithBh@i Webhook Secret | `x-webhook-secret` | `N8N_WEBHOOK_SECRET` |
| AIWithBh@i Vercel Cron Bearer | `Authorization` | `Bearer <CRON_SECRET>` |
| AIWithBh@i Internal Webhook Bearer | `Authorization` | `Bearer <N8N_WEBHOOK_SECRET>` |

Select the corresponding credentials in each Webhook and HTTP Request node. Activate workflows only after configuration. Copy Production URLs into Vercel `N8N_DAILY_CONTENT_WEBHOOK_URL` and `N8N_VIDEO_PRODUCTION_WEBHOOK_URL`.

The video flow enqueues a durable job. It does not need an n8n Supabase credential. The Windows worker uses the service-role key from its local `.env` to poll the queue and upload to the private `generated-videos` bucket.
