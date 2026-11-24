# AIWithBh@i Studio

**Your AI research desk and content-production workspace — built to help one creator turn useful technology signals into thoughtful, original short-form content.**

AIWithBh@i Studio brings YouTube research, Instagram research, AI-assisted planning, content packaging and human approvals into one place. It is designed around a simple idea:

> Let the system do the research and preparation. Let a human make the important decisions.

This document explains how the solution fits together, what happens to the data, which services do what, and where automation deliberately stops.

---

## 1. The big picture

The platform has five main parts:

1. **Research** – learn from relevant YouTube channels, videos, Instagram professional profiles and posts, plus wider AI and technology signals.
2. **Opportunity discovery** – turn those signals into original topics for the AIWithBh@i audience.
3. **Content preparation** – prepare the hook, script, narration, scene plan, visual prompts and platform copy.
4. **Human review** – let the channel owner approve or reject an idea before it moves forward.
5. **Production hand-off** – send approved content to an n8n workflow for video production. The finished video should be reviewed before publishing.

The intended daily rhythm is:

```text
6:00 AM IST
    |
    v
Daily research starts in the cloud
    |
    +--> YouTube research signals
    |
    +--> Connected / tracked Instagram signals
    |
    +--> AI topic and opportunity analysis
    |
    v
Content Opportunities in the dashboard
    |
    v
Human reviews the idea and its content package
    |
    +--> Reject / keep for later
    |
    +--> Approve
            |
            v
       n8n production workflow
            |
            v
       Video draft (9:16, HD target)
            |
            v
       Human reviews the finished video
            |
            v
       Publishing only after explicit authorization
```

The 6:00 AM schedule is configured in Vercel Cron. The scheduled route sends a request to an n8n webhook; the research workflow itself must be configured and activated in n8n.

---

## 2. Who the channel is for

**Brand:** AIWithBh@i  
**Focus:** Practical AI engineering, AI systems and automation  
**Audience:** Software engineers, backend developers, AI engineers, solution architects and IT professionals.

The editorial focus includes:

- AI system design and architecture
- Large language model (LLM) applications
- Retrieval-augmented generation (RAG), embeddings and vector databases
- AI agents and multi-agent systems
- Model serving, inference and optimization
- Production reliability, evaluation and observability
- Security, privacy, governance, cost and latency
- Real-world architecture and engineering case studies

The goal is not to repeat every AI headline. It is to explain what is useful, how a system works, what trade-offs matter and what an engineer can learn from it.

---

## 3. Application architecture

The application is a Next.js web app. It handles the dashboard, authenticated user experience and server-side API routes.

| Layer | Technology | Responsibility |
|---|---|---|
| Web application | Next.js 15, React, TypeScript | Dashboard, pages and API routes |
| Hosting and schedules | Vercel | Hosts the web app and invokes scheduled routes |
| Database | Supabase PostgreSQL | Stores users' research, ideas, scripts, approvals and settings |
| Authentication | Supabase Auth | Identifies the signed-in user |
| File storage | Supabase Storage (where configured) | Stores supported media and generated assets |
| AI reasoning | Gemini | Primary AI provider for research and structured content generation |
| AI fallback | Groq | Alternative provider when configured and eligible for fallback |
| Workflow automation | n8n Cloud | Receives scheduled research and approved-production events |
| YouTube research | YouTube Data API v3 | Finds channels/videos and retrieves permitted metadata |
| Instagram research | Official Meta / Instagram Graph APIs | Retrieves eligible professional-account and media information |

### How a request moves through the system

1. A user opens the dashboard and signs in.
2. The browser calls a Next.js API route.
3. The API route verifies the Supabase session.
4. The route reads or writes only records belonging to the signed-in user.
5. If AI work is needed, the server calls the configured AI provider.
6. Results are stored in Supabase and returned to the dashboard.
7. Scheduled or approved automation events are sent server-to-server to n8n.

The browser does not need direct access to private AI, Meta, YouTube or n8n secrets.

---

## 4. Research inputs

### YouTube

The YouTube research flow discovers candidate channels and collects video/channel metadata using the YouTube Data API.

AI screening helps assess whether a candidate is relevant to the channel's technical audience. It is a recommendation aid, not proof that a creator's information is correct. Human review remains important.

The application includes quota-aware tracking for API calls made through this project. YouTube search requests are relatively expensive in quota units, so discovery and monitoring should be deliberate. The app's quota tracker cannot see usage by other applications using the same Google Cloud project.

### Instagram

Instagram research uses official Meta APIs for eligible professional Business or Creator accounts and supported Business Discovery lookups.

The integration can save available profile and media information, such as captions, links, timestamps and engagement counts, depending on permissions and API availability.

It is not an unrestricted Instagram search engine. It does not scrape the platform, retrieve every public Reel, or provide private account analytics. Some URLs and personal/private accounts cannot be resolved through the supported API.

Instagram posts are research references and trend signals. They are not source material to copy or repost.

### Research quality

AI-generated findings should be checked against primary sources where possible: official product documentation, engineering blogs, papers, release notes and source repositories. Separate verified facts from vendor claims, benchmarks and editorial interpretation. Do not invent metrics or imply that a demonstration is production-ready.

---

## 5. Content Opportunities and the short-video package

Content Opportunities combines relevant research signals and asks the AI provider to develop original angles for the channel.

Each idea is intended to include:

- Topic, title and opening hook
- Audience problem and technical angle
- Suggested structure / outline
- Research references where available
- Complexity classification
- Complete script and voiceover
- Scene-by-scene timing
- Visual-generation prompt for each scene
- On-screen text
- Instagram caption and hashtags
- YouTube Shorts title and description
- A consistent vertical-video style

### Video duration

The intended video is one shared vertical concept for YouTube Shorts and Instagram Reels.

| Topic complexity | Target duration |
|---|---:|
| Simple | 30–40 seconds |
| Medium | 40–50 seconds |
| Complex | 50–60 seconds |

The allowed duration is **30–60 seconds**. The script should fit the topic naturally; it should not be padded just to reach a target length.

**Video format target:** 9:16 vertical, HD-quality output, with readable subtitles, clear narration and visuals that support the explanation.

The content package and scene prompts are prepared by the app. Actual rendered video output depends on the connected n8n production workflow and the video-generation service selected for that workflow.

---

## 6. Approved-script video production and transcript verification

Once an idea is approved, the application freezes the exact approved narration and calculates a SHA-256 fingerprint. The production workflow receives that immutable script plus an ordered timeline of clips, each up to approximately seven seconds long. The final clip can be shorter so the complete video remains within the 30–60 second target.

The expected n8n workflow:
1. Generate one continuous voice track from the approved narration without rewriting it.
2. Generate separate 9:16 visual clips for each segment.
3. Assemble clips strictly by sequence number, keep narration continuous and add subtitles from the approved script.
4. Render one final MP4, transcribe its rendered audio and upload it to the private Supabase `generated-videos` bucket.
5. Send a signed callback with the transcript, script hash, final storage path and completed segment list.

The application validates the callback, checks the script fingerprint, confirms every segment is present and ordered, and compares the final transcript word-for-word after ignoring case and punctuation. A transcript mismatch or incomplete segment list moves the video to `review_required`; only a verified match is marked `ready`.

Production events create in-app notifications. The Content Opportunities page shows recent notifications and provides a short-lived signed link to open a verified video. The bucket remains private.

**Important:** The application supplies the workflow contract and verification endpoints. The actual n8n nodes, TTS, video-generation provider, FFmpeg assembly and speech-to-text provider must still be configured in n8n. See [the n8n verified video workflow guide](docs/n8n-verified-video-production.md).

---

## 7. Approval is a deliberate product feature

Automation should not take control away from the creator.

The intended approval sequence is:

| Stage | What happens | Who decides? |
|---|---|---|
| Research | Gather signals and identify opportunities | System |
| Draft | Prepare script and production package | System |
| Idea review | Approve or reject the idea | Channel owner |
| Video production | Start only after approval | System, after approval |
| Final video review | Check accuracy, quality, branding and rights | Channel owner |
| Publishing | Publish only when explicitly authorized | Channel owner / separately authorized workflow |

Approving an idea is permission to start the configured production hand-off. It is **not** permission to publish the finished video.

The system must not automate YouTube views, likes, subscriptions or comments.

---

## 8. Cloud automation and schedules

### Daily content research

The Vercel Cron configuration includes:

- Route: `/api/cron/daily-content`
- Schedule: `30 0 * * *` (UTC)
- Local time: **6:00 AM IST**

The route checks `CRON_SECRET` and sends the daily research event to `N8N_DAILY_CONTENT_WEBHOOK_URL`. The request includes the brand, niche, timezone, platform targets, duration bands and approval requirements.

### Competitor monitoring

The existing Vercel Cron configuration also includes:

- Route: `/api/cron/manual-channel-monitor`
- Schedule: `15 2 * * *` (UTC)
- Local time: **7:45 AM IST**

This is a separate monitoring task; it is not the daily content-research schedule.

### n8n's role

n8n is the workflow engine, not the dashboard database. It receives events from the app and coordinates configured steps such as research, AI processing, video generation, file storage and notifications.

The app expects these webhook endpoints to be configured:

- `N8N_DAILY_CONTENT_WEBHOOK_URL` – daily research workflow.
- `N8N_VIDEO_PRODUCTION_WEBHOOK_URL` – production workflow for approved ideas.

The exact video-generation provider, credentials, rendering settings, storage destination and final-video callback must be configured in n8n. A webhook being configured does not by itself mean that a complete video-rendering workflow is ready.

---

## 9. Data and privacy boundaries

Supabase is the system of record for application data.

The database stores information such as:

- Channel and competitor research
- YouTube video evidence and Instagram research references
- Content ideas and their source references
- Scripts, scene plans and production metadata
- Approval decisions and workflow status
- Brand identity and application settings

Tables that contain user-owned records use Row Level Security (RLS) policies so users can access only their own data through the authenticated application.

Server-only credentials must stay on the server. Never commit real keys or add private credentials to a variable prefixed with `NEXT_PUBLIC_`.

The Meta token encryption key must remain stable after encrypted tokens have been saved. Replacing it without a migration/re-encryption plan can make existing stored tokens unreadable.

---

## 10. Important environment variables

Add values in Vercel Project Settings → Environment Variables and in the relevant local environment file for development. Do not commit actual secret values.

| Variable | Used for | Visibility |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client authentication | Browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-side Supabase operations where used | Server only |
| `GEMINI_API_KEY` | Primary AI provider | Server only |
| `GEMINI_MODEL` | Optional Gemini model selection | Server only |
| `AI_PRIMARY_PROVIDER` | Selects the preferred AI provider | Server only |
| `GROQ_API_KEY` | AI fallback provider | Server only |
| `GROQ_MODEL` | Optional Groq model selection | Server only |
| `YOUTUBE_API_KEY` | YouTube Data API access | Server only |
| `META_APP_ID` | Meta app identifier | Server configuration |
| `META_APP_SECRET` | Meta OAuth app secret | Server only |
| `META_REDIRECT_URI` | Exact Meta OAuth callback URL | Server configuration |
| `META_TOKEN_ENCRYPTION_KEY` | Encrypts stored Meta tokens | Server only |
| `META_LOGIN_CONFIG_ID` | Meta Login for Business configuration | Server configuration |
| `N8N_BASE_URL` | n8n instance base URL, if used by configured routes | Server configuration |
| `N8N_WEBHOOK_SECRET` | Shared secret for app-to-n8n requests | Server only |
| `N8N_DAILY_CONTENT_WEBHOOK_URL` | Daily research workflow endpoint | Server only |
| `N8N_VIDEO_PRODUCTION_WEBHOOK_URL` | Approved video production endpoint | Server only |
| `CRON_SECRET` | Protects scheduled API routes | Server only |
| `NEXT_PUBLIC_APP_URL` | Public application URL, where used | Browser + server |

Only configure integrations you actually use. Some routes may have additional requirements; check the relevant route and the current deployment environment before enabling them.

---

## 11. Database migrations

Database structure is versioned in `supabase/migrations/`.

A migration should be applied to the intended Supabase project before deploying code that depends on its tables or columns. Do not blindly re-run migrations that have already been applied; check the project's migration history and current schema first.

The repository contains migrations for features including:

- YouTube quota management
- Competitor discovery and review
- Instagram research integration
- Brand identity and Brand Studio
- Research-backed content calendar and scripts
- Channel Preparation Mode
- Short-video package and production status fields

The migration files describe the intended schema. Their presence in Git does not prove they have already been executed in Supabase.

---

## 12. Repository map

A quick guide to the main folders:

```text
.
├── src/
│   ├── app/
│   │   ├── api/                 # Server-side API routes
│   │   │   ├── cron/            # Scheduled Vercel endpoints
│   │   │   ├── competitors/     # YouTube competitor discovery
│   │   │   ├── instagram/       # Meta OAuth and Instagram research
│   │   │   ├── content-opportunities/
│   │   │   └── brand-studio/
│   │   ├── content-opportunities/ # Opportunity review dashboard
│   │   └── ...                  # Other dashboard pages
│   └── lib/
│       ├── ai/                  # AI provider and JSON generation helpers
│       └── supabase/            # Supabase server/browser clients
├── supabase/
│   └── migrations/              # Versioned database schema changes
├── vercel.json                  # Vercel Cron schedules
├── package.json                 # Dependencies and project scripts
└── README.md                    # Solution architecture and operating model
```

---

## 13. Deploying and operating the solution

A typical release follows this order:

1. Pull the intended Git branch.
2. Install dependencies with `npm install`.
3. Run `npm run typecheck` and `npm run build`.
4. Apply any pending Supabase migrations.
5. Confirm required environment variables in Vercel.
6. Deploy to a Preview environment first.
7. Test sign-in, research pages, Content Opportunities and approval actions.
8. Test the n8n webhook with a non-production sample.
9. Confirm the scheduled route is protected and the Vercel Cron job is visible.
10. Promote to Production only after the checks pass.

Useful local commands:

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run lint
```

---

## 14. What this architecture does — and does not — promise

**Designed to do**

- Run cloud-hosted research and scheduled workflow triggers.
- Combine supported YouTube and Instagram research signals.
- Prepare original content ideas and short-form production briefs.
- Keep approval decisions with the channel owner.
- Hand approved work to a configured n8n workflow.
- Keep application data in Supabase and application code in GitHub.

**Not automatic just because the app is deployed**

- Meta approval, account eligibility or unrestricted Instagram search.
- A working n8n workflow or a selected video-generation provider.
- Completed HD rendering, storage, or delivery of the final video.
- Automatic publishing to YouTube or Instagram.
- Proof that a generated claim, script or visual is accurate or rights-cleared.
- Successful execution of a database migration that has only been committed to Git.

The repository contains application code and integration points. Each external service still needs valid credentials, permissions, configuration and end-to-end testing.

---

## 15. The guiding principle

**Research broadly. Explain clearly. Create originally. Review carefully. Publish deliberately.**

That is the architecture behind AIWithBh@i Studio.
