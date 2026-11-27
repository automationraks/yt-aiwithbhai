# AIWithBh@i Scene Image Worker

This worker generates one original 9:16 PNG per queued `scene_asset_jobs` row using the Gemini/Imagen prediction API, uploads it to the private `generated-videos` Supabase Storage bucket, and marks the row completed.

## Deploy as a separate Docker service

Use the repository root as the build context and `scene-worker/Dockerfile` as the Dockerfile path. Set these environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret; never expose to the browser)
- `GEMINI_API_KEY`
- `GEMINI_IMAGE_MODEL` (default: `imagen-3.0-generate-002`)
- `ASSET_BUCKET` (default: `generated-videos`)
- `POLL_INTERVAL_MS` (default: `5000`)

The service exposes `GET /health` on the configured `PORT`. It polls Supabase; no inbound job webhook is required.

## Required order

1. Apply migrations through `20261127000700_phase_r_s_workspace_cloud_production.sql` in Supabase.
2. Ensure the private `generated-videos` storage bucket exists and has enough capacity.
3. Deploy this worker with the environment variables above.
4. Confirm `/health` returns `ok: true`.
5. Approve a content idea and queue its scene prompts from the Scene Asset Jobs page.
6. Wait for each scene job to become `completed`.
7. Run video production. The renderer downloads completed scene PNGs and uses them in the matching scene sequence; missing assets fall back to the existing stock/gradient path.

## Operational notes

- The worker uses PostgreSQL `FOR UPDATE SKIP LOCKED` lease claims, with a 10-minute lease and 30-second heartbeats.
- Failed jobs are retried when the lease expires until `max_attempts` is reached. The UI/API can requeue a failed scene job by requesting the scene prompt queue again.
- Gemini image generation availability, model access, billing and per-project limits depend on the Google AI project. The worker reports provider errors on the job row; a successful Docker deployment does not prove the provider can generate images.
- This is an image-generation worker, separate from the existing narration/video renderer.
