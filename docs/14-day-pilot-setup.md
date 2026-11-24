# AIWithBh@i Studio — 14-day local-render pilot

## Architecture

- Vercel: dashboard, daily 06:00 IST cron, authenticated internal research and queue APIs.
- n8n Cloud: receives the two webhooks, validates the event and invokes the app APIs.
- Supabase: research, content ideas, durable render-job queue and private video bucket.
- Gemini: research provider and narration (Gemini 2.5 Flash Preview TTS).
- Windows PC: outbound-polling worker, FFmpeg 1080×1920 assembly, local faster-whisper transcript check.
- Visuals: locally supplied licensed stock footage/images plus original generated technical graphic cards. Runway is not used in this no-paid-video-API pilot.

## 1. Database

Apply these migrations to the correct Supabase project, in migration order after checking the Supabase migration history:
- `20261124_verified_video_production.sql`
- `20261125_custom_application_auth.sql` (if not already applied)
- `20261125_local_video_render_jobs.sql`

The queue migration references `public.app_users`, consistent with the app's custom session authentication. The `generated-videos` bucket must remain private. Never add browser RLS policies to `video_render_jobs`.

## 2. Vercel environment

Set server-side variables and redeploy:
- `AUTOMATION_OWNER_ID`: UUID of the owner account in `public.app_users` that owns the research rows.
- `CRON_SECRET`: long random value used by the internal daily research route.
- `N8N_WEBHOOK_SECRET`: a different long random value shared with n8n and the local worker.
- `NEXT_PUBLIC_APP_URL`: exact public origin, e.g. `https://your-app.vercel.app`.
- Existing `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_PRIMARY_PROVIDER`; optionally `GROQ_API_KEY` and `GROQ_MODEL`.
- Set `N8N_DAILY_CONTENT_WEBHOOK_URL` and `N8N_VIDEO_PRODUCTION_WEBHOOK_URL` after n8n workflows are activated.

Use separate random secrets. Do not commit or paste credentials into GitHub/chat. Do not prefix server secrets with `NEXT_PUBLIC_`.

## 3. Import workflows into n8n

Import from file:
1. `n8n/daily-content-research.json`
2. `n8n/approved-video-production.json`

Both workflows are deliberately inactive after import. Replace every `https://YOUR-VERCEL-DOMAIN.vercel.app` with the exact `NEXT_PUBLIC_APP_URL` in the HTTP Request nodes. In the video Code node, replace the same placeholder in the callback URL check.

Create three n8n credentials (Credentials → Add Credential → Header Auth):

| Name | Header name | Header value |
|---|---|---|
| AIWithBh@i Webhook Secret | `x-webhook-secret` | `N8N_WEBHOOK_SECRET` |
| AIWithBh@i Vercel Cron Bearer | `Authorization` | `Bearer <CRON_SECRET>` |
| AIWithBh@i Internal Webhook Bearer | `Authorization` | `Bearer <N8N_WEBHOOK_SECRET>` |

Select the matching credential on each node if n8n prompts after import:
- Both Webhook nodes → AIWithBh@i Webhook Secret.
- Daily HTTP Request → AIWithBh@i Vercel Cron Bearer.
- Video HTTP Request → AIWithBh@i Internal Webhook Bearer.

Save, activate each workflow and copy its Production URL (not Test URL):
- Daily URL → Vercel `N8N_DAILY_CONTENT_WEBHOOK_URL`.
- Video URL → Vercel `N8N_VIDEO_PRODUCTION_WEBHOOK_URL`.

Redeploy Vercel after setting URLs. Existing cron schedule `30 0 * * *` is 06:00 IST. The app's cron route supplies the webhook secret header. Do not activate until URL placeholders and credentials are set.

## 4. Windows setup

Install Node.js 20+, Python 3.10–3.12 and a full FFmpeg Windows build that includes the libass `subtitles` filter and `libx264` encoder. Adjust the example executable paths below if you install elsewhere. Then in PowerShell:

```powershell
cd E:\FR_Projects\yt-aiwithbhai\local-worker
Copy-Item .env.example .env
notepad .env
npm install
npm run check
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Edit `.env` with Supabase project URL, service-role key, Gemini API key, the same `N8N_WEBHOOK_SECRET`, and the exact FFmpeg/FFprobe executable paths. Set `PYTHON_PATH` to `.venv\Scripts\python.exe` if not using the activated environment.

Check:
```powershell
& "C:\\ffmpeg\\bin\\ffmpeg.exe" -version
& "C:\\ffmpeg\\bin\\ffprobe.exe" -version
& "C:\\ffmpeg\\bin\\ffmpeg.exe" -filters | findstr subtitles
& "C:\\ffmpeg\\bin\\ffmpeg.exe" -encoders | findstr libx264
python -c "import faster_whisper; print('ASR ready')"
npm start
```

In another PowerShell window:
```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

Put licensed stock files in `local-worker\assets\stock`. With no stock files, the renderer creates original technical cards. The worker only makes outbound Supabase/API requests. **Do not expose port 8787 or create a Cloudflare Tunnel.** Keep the PC awake and worker running to process queued video jobs; daily research remains cloud-based.

## 5. Test sequence

1. Confirm the migrations and private storage bucket are present.
2. Confirm `AUTOMATION_OWNER_ID` is an app_users UUID and the owner has qualified competitors plus niche-matched videos.
3. Execute the daily webhook in n8n with a test body containing `event: daily_content_research`, `brand: AIWithBh@i`, `timezone: Asia/Kolkata`; use the webhook header credential. Confirm new ideas appear in Content Opportunities.
4. Approve one test idea. The n8n video webhook should enqueue a row in `video_render_jobs` and return HTTP 202.
5. With the Windows worker running, confirm it claims the job, synthesizes audio, renders sequential 7-second clips, adds captions, uploads clips/final MP4 and calls the callback.
6. Confirm the app marks the video `ready` only when the final audio transcript exactly matches the approved narration after case/punctuation normalization. A mismatch becomes `review_required`.
7. Review the final video manually for factual accuracy, visual rights, sound, subtitles and framing. Publishing remains manual.

## Important limitations

- Gemini TTS free-tier eligibility, quotas, availability and data terms depend on your Google project/account. The official pricing page currently lists a free tier for Gemini 2.5 Flash Preview TTS, but check current account eligibility and terms before production: https://ai.google.dev/gemini-api/docs/pricing
- TTS duration must be close to the app's estimated duration. The worker adjusts audio speed within a bounded 0.82–1.20 ratio; it fails rather than silently truncating a long script.
- ASR may differ on punctuation, numbers, acronyms or pronunciation. The exact-match gate can deliberately send an otherwise usable video to review.
- CPU transcription is slower; the first faster-whisper model run downloads model files.
- Only one render job is processed at a time. Jobs stay queued while the PC is offline.
- No automatic publishing, engagement automation, scraping, Runway API, or paid stock downloads are included.
