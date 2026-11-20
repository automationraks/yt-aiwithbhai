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

### Research rules
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
Set `GEMINI_API_KEY` for Gemini screening. Optional `GEMINI_MODEL` defaults to `gemini-2.5-flash-lite`. Groq fallback uses `GROQ_API_KEY` and optional `GROQ_MODEL` (default `openai/gpt-oss-120b`).

## Local development
Install dependencies with `npm install`, copy `.env.example` to `.env.local`, add server-side credentials and run `npm run dev`.

## Automation boundary
Manual research and refresh endpoints do not create scheduled workflows. Configure and activate n8n Cloud workflows separately. Publishing and channel-setting changes must remain approval-gated.
