# n8n workflow contract: verified short-video production

This document describes the n8n workflow expected by AIWithBh@i Studio. The application sends an approved script and an ordered list of approximately seven-second video segments. n8n is responsible for rendering, assembling, storing and reporting the final video.

## Trigger

Create an n8n Webhook workflow that receives the POST request sent to `N8N_VIDEO_PRODUCTION_WEBHOOK_URL`.

Validate:
- `event === "content_approved"`
- `ownerId`, `idea.id`, `approvedScript` and `approvedScriptHash` are present
- Recompute SHA-256 of `approvedScript` and compare it to `approvedScriptHash` before doing any work
- The callback URL is the application's `/api/video-production/complete` endpoint

The webhook secret arrives in `x-webhook-secret`. Keep the n8n webhook private and do not log credentials.

## Production sequence

1. **Freeze the source** – use only `idea.approvedScript` for narration. Do not ask an AI model or video provider to rewrite, paraphrase, summarize or improvise spoken words.
2. **Generate one continuous voice track** – send the exact approved script to the chosen TTS provider. Keep the same voice, pronunciation and language for the whole video.
3. **Prepare the timeline** – the application supplies `idea.segments` in sequence order. Each segment has a sequence number, start/end time, narration text, visual prompt and output storage path. Segment lengths are up to 7 seconds; the final segment may be shorter to respect the 30–60 second target.
4. **Generate visuals** – create one vertical 9:16 clip per segment. Visuals may illustrate the narration, but must not contain newly generated spoken dialogue. Use the segment visual prompt and on-screen text as guidance.
5. **Assemble deterministically** – sort by `sequence`, verify that every expected clip exists, and concatenate in ascending order. Keep the approved voice track continuous and aligned to the timeline. Use transitions sparingly; never reorder or drop a segment.
6. **Add captions** – create subtitles from the approved script / word timing, not from an AI-rewritten version. Keep captions synchronized to the final voice track.
7. **Render** – export a single 9:16 MP4 (target 1080×1920) with a 30–60 second duration. Normalize audio and verify the output file is playable.
8. **Transcribe the rendered output** – run speech recognition against the final rendered MP4's audio track. Return the full transcript without summarizing it.
9. **Upload** – use the Supabase service-role credential stored only in n8n credentials to upload the final MP4 to the private `generated-videos` bucket at the exact `storage.finalPath` supplied by the app. Upload each generated segment to its matching `outputStoragePath`. Never make the bucket public.
10. **Callback** – POST the result to `callback.url` with header `x-production-callback-secret` set to the same secret as `N8N_WEBHOOK_SECRET`.

## Successful callback payload

```json
{
  "ownerId": "the ownerId from the trigger",
  "ideaId": "the idea.id from the trigger",
  "status": "completed",
  "finalStoragePath": "the exact storage.finalPath",
  "scriptHash": "the unchanged idea.approvedScriptHash",
  "transcript": "full speech-to-text transcript from the final rendered video",
  "durationSeconds": 42,
  "segmentResults": [
    {
      "sequence": 1,
      "storagePath": "the first segment outputStoragePath",
      "status": "completed"
    }
  ]
}
```

Include one `segmentResults` item for every segment, in ascending order, with its exact `outputStoragePath` and `status: "completed"`. The callback rejects missing, reordered or failed segments.

## Failure callback

If rendering or uploading fails, POST:

```json
{
  "ownerId": "the ownerId from the trigger",
  "ideaId": "the idea.id from the trigger",
  "status": "failed",
  "error": "Short, safe description of the failure"
}
```

Use the same `x-production-callback-secret` header.

## What the application verifies

The callback endpoint:
- Authenticates the n8n callback with the shared secret.
- Confirms the final file exists in the private Supabase bucket at the owner/idea-specific path.
- Checks the approved script hash has not changed.
- Checks every segment is present, completed and in the expected sequence.
- Normalizes capitalization and punctuation, then compares the transcript word-for-word with the approved narration.
- Marks the video `ready` only when all checks pass.
- Marks a mismatch or segment problem `review_required`; it never marks that video ready.
- Creates an in-app notification for success, failure or review required.

The Content Opportunities page displays recent production notifications. A verified video is opened using a short-lived signed URL; the storage bucket remains private.

## Important implementation note

The application code defines this contract and validates the callback. It does not itself create an n8n workflow or provision a video-generation/TTS/ASR provider. Configure those provider nodes, credentials, retry handling and FFmpeg (or an equivalent video assembly service) in n8n before expecting rendered videos. Test with a non-production idea first.
