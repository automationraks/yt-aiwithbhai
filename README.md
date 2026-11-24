# AIWithBh@i Studio

AI-powered YouTube research and content operations workspace for the existing **AIWithBh@i** channel.

## Channel positioning

**Niche:** AI Systems Architecture & Engineering  
**Audience:** Software engineers, backend developers, AI engineers, solution architects and IT professionals.  
**Promise:** Explain how to design, build, scale, evaluate and operate production-grade AI systems.

### Core content pillars
- AI system design and architecture
- LLM application architecture and orchestration
- Retrieval-augmented generation (RAG), embeddings and vector databases
- AI agents and multi-agent systems
- Model serving, inference and optimization
- Distributed systems and scalable AI infrastructure
- Evaluation, observability, reliability, security and governance
- Real-world AI architecture case studies

### Global AI intelligence and model watchlist

The research radar's source registry covers frontier models, hardware and inference, cloud AI, open-weight ecosystems, developer infrastructure and research papers. The model watchlist includes GPT, Claude, Gemini, Grok, Kimi, DeepSeek, Qwen, GLM, MiniMax, Llama, Mistral, Command, Granite, Nemotron, Phi, Seed, ERNIE and Hunyuan. This is an extensible editorial watchlist, not a claim that every family has a working RSS feed or that every listed model is the newest release.

Some publishers expose RSS/Atom while others only expose web pages or release feeds. Feed availability must be checked; an unavailable feed is not evidence that a provider has no news. Prefer official announcements, documentation, papers and repositories.

## Case-study-first editorial strategy

The channel's main output is technical case studies, not headline summaries. Evaluate each trend for:
- Architecture breakdown: components, data flow, model serving and orchestration.
- Engineering deep dive: training, fine-tuning, inference, evaluation and reliability.
- Product/business case study: use case, adoption, trade-offs and measurable outcomes.
- Model/platform comparison: capability, cost, latency, quality, privacy and openness.
- Open-source implementation: repository, licence, deployment and reproducibility.
- Failure analysis: incidents, security, limitations and engineering lessons.
- Research-to-production: translate papers into practical implementation and explain what remains unproven.

Each case study should collect the original announcement or paper, primary documentation, code/repository and independent corroboration where possible. Separate confirmed facts, vendor claims, benchmark results and editorial analysis. Never invent performance metrics or imply that a demo is production-ready.

## Research rules
Find creators who teach technical AI systems engineering. Do not classify channels as relevant merely because they discuss AI news, AI tools or prompt engineering. Review multiple videos for technical depth, accuracy, practical implementation and relevance to software/IT professionals.

## Existing stack retained
- Next.js 15 + TypeScript on Vercel
- Supabase PostgreSQL, Auth and Storage
- n8n Cloud for scheduled workflows
- Gemini as primary AI provider; Groq as fallback
- YouTube Data API with quota-aware request reservations

## YouTube API quota setup
Run `supabase/migrations/20261115_youtube_quota_management.sql` in Supabase SQL Editor if it has not already been applied. The application tracks its own API usage; other apps using the same Google Cloud project are not included. Verify actual usage in Google Cloud Console → APIs & Services → YouTube Data API v3 → Quotas.

## Research setup
The starter keyword action seeds English and Hindi searches for AI system design, LLM architecture, RAG, AI agents and production AI engineering. Search language is a relevance hint, not proof of spoken language.

Creator discovery returns candidates. AI screening is advisory and cannot establish technical correctness or substitute for watching sample videos. Manually approve creators before including them in the active research set.

## AI providers
Set `GEMINI_API_KEY` for Gemini screening. Optional `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`. Gemini calls use Google's Interactions API (`/v1beta/interactions`) with stateless requests (`store: false`) and JSON response formatting. Groq fallback uses `GROQ_API_KEY` and optional `GROQ_MODEL` (default `openai/gpt-oss-120b`). Video Explorer classification is pinned to Gemini and does not fall back to Groq.

## Local development
Install dependencies with `npm install`, copy `.env.example` to `.env.local`, add server-side credentials and run `npm run dev`.

## Automation boundary
Manual research and refresh endpoints do not create scheduled workflows. Configure and activate n8n Cloud workflows separately. Publishing and channel-setting changes must remain approval-gated.

## Instagram Discovery (official Meta APIs)

The Instagram Discovery page connects a professional Instagram Business/Creator account through Meta OAuth and uses the Instagram Graph API / Business Discovery for the connected account and manually entered eligible public professional usernames. It saves available captions, post/Reel permalinks, timestamps and engagement counts as research references. It does not scrape Instagram, search all public Reels, download third-party videos or republish creator media.

### Required server environment variables

- `META_APP_ID`: Meta Developer app ID.
- `META_APP_SECRET`: Meta Developer app secret.
- `META_REDIRECT_URI`: exact OAuth callback URL, e.g. `https://YOUR_DOMAIN/api/instagram/callback`. Register the same URL in the Meta app.
- `META_GRAPH_VERSION`: optional Graph API version; defaults to `v25.0`.
- `META_TOKEN_ENCRYPTION_KEY`: base64-encoded 32-byte key used for AES-256-GCM encryption of the Page access token.
- Existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (or `GROQ_API_KEY`) are also required.

Generate an encryption key with Node.js: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep it private and stable; do not commit it or expose it with a `NEXT_PUBLIC_` prefix.

### Meta setup

1. Create/configure a Meta Developer app and add the Facebook Login and Instagram Graph API products required for your app configuration.
2. Add the exact redirect URL above to Valid OAuth Redirect URIs.
3. Link the Instagram Business/Creator account to a Facebook Page and ensure the authorizing Facebook user has access to that Page.
4. Request the least permissions required by the implemented flow: `pages_show_list`, `pages_read_engagement`, `instagram_basic` and `instagram_manage_insights`. Meta may require App Review and Business Verification before accounts outside app roles can be accessed.
5. Apply `supabase/migrations/20261122_instagram_research_integration.sql` in the Supabase SQL Editor.
6. Add the environment variables in Vercel and redeploy, then connect from **Research → Instagram Discovery**.

Instagram content is used as a topic signal to create a new original 50–60 second script in Content Calendar. Drafts remain approval-gated. Verify technical claims with primary sources before publishing. API availability and returned fields depend on Meta's current platform eligibility, permissions and API version.
