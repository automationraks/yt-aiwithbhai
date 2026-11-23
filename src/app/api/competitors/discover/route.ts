import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAIConfiguration } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const MAX_ACTIVE_COMPETITORS = 100;
const MAX_CHANNELS_PER_AI_SCREEN = 24;
const AI_SCREEN_BATCH_SIZE = 2;
const MIN_DISCOVERY_SCORE = 50;

type QuotaReservation = { allowed: boolean; bucket: string; used: number; limit: number; remaining: number; resetAt: string; quotaDate: string };
type SampleVideo = {
  videoId: string | null;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  matchedQuery: string;
  videoUrl: string | null;
};
type YouTubeChannel = {
  id: string;
  snippet?: { title?: string; description?: string; publishedAt?: string; country?: string; customUrl?: string };
  statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
};


type Assessment = { channelId: string; confidenceScore: number; nicheRelevance: number; recommendation: string; reason: string; evidence: string[] };
type RejectedLearningExample = { channelTitle: string; description: string | null; reviewNote: string | null; confidenceScore?: number; nicheRelevance?: number };
function asRecord(value: unknown): Record<string, unknown> {
 return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const assessmentRules = "You are a strict B2B technical creator research analyst for AIWithBh@i. The target audience is professional practitioners: AI Engineers, LLM Engineers, ML Engineers building production systems, AI Solution Architects, Enterprise/Solutions Architects designing AI products, AI Engineering Managers, technical leads, MLOps/LLMOps engineers and AI platform engineers. Discover channels that teach or demonstrate how to BUILD, DESIGN, INTEGRATE, DEPLOY, EVALUATE, SECURE and OPERATE real AI systems. Priority topics: production LLM applications, RAG pipelines and retrieval evaluation, agentic workflows and orchestration, enterprise copilots, AI product architecture, API/backend integration, vector databases, model serving and inference, GPU infrastructure, LLMOps/MLOps, monitoring/tracing/evaluation, guardrails, security/governance, latency/cost/reliability, cloud AI architecture and hands-on implementation. Also include deep technical developer coverage of AI models, APIs, frameworks and tools when it serves engineers building solutions. A channel can qualify through sustained depth in one or more of these areas; it need not cover everything. Judge actual sample video titles and descriptions plus channel description, not broad keywords or channel name. Require evidence of practical engineering, architecture decisions, code, implementation walkthroughs, system trade-offs, production deployment or technical analysis. Reject or strongly down-rank children's content, kids learning, cartoons, nursery rhymes, toy/unboxing, school homework channels, stock market, share market, trading, investing, crypto trading, finance tips, generic business/entrepreneurship, gaming, entertainment, general news, motivational content, generic coding with no AI systems relevance, shallow AI tool lists and AI hype without implementation. Do not mistake a channel for an AI engineering educator merely because it mentions AI, technology, software or business. Official vendor channels qualify only when supplied samples demonstrate relevant AI engineering, developer tools, architecture or implementation. Never infer fit from subscriber count or channel name alone. Score nicheRelevance against this professional AI engineering audience, not general technology interest. Provide confidenceScore 0-100, nicheRelevance 0-100, recommendation strong_candidate/possible_candidate/unlikely_match, concise reason and up to 3 specific evidence items. A candidate can pass when confidenceScore and nicheRelevance are both at least 40 and there is specific evidence of professional AI engineering relevance. Scores below 40 or no credible evidence must be rejected. recommendation may be strong_candidate or possible_candidate when the 40-point threshold is met; use unlikely_match below 40. Return ONLY JSON in this shape: {\"assessments\":[{\"channelId\":\"...\",\"confidenceScore\":0,\"nicheRelevance\":0,\"recommendation\":\"unlikely_match\",\"reason\":\"...\",\"evidence\":[\"...\"]}]}. Include every channelId exactly once.";
function parseAssessments(raw: string, ids: string[]) {
 const cleaned=raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
 const jsonText=cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;
 const parsed=JSON.parse(jsonText); const map=new Map<string,Assessment>();
 for(const x of (Array.isArray(parsed.assessments)?parsed.assessments:[])) {
  if(!ids.includes(x.channelId)||map.has(x.channelId)) continue;
  const n=(v:unknown)=>Math.max(0,Math.min(100,Math.round(Number(v)||0)));
  map.set(x.channelId,{channelId:x.channelId,confidenceScore:n(x.confidenceScore),nicheRelevance:n(x.nicheRelevance),recommendation:["strong_candidate","possible_candidate","unlikely_match"].includes(x.recommendation)?x.recommendation:"unlikely_match",reason:typeof x.reason==="string"?x.reason.slice(0,500):"No reason supplied.",evidence:Array.isArray(x.evidence)?x.evidence.filter((v:unknown)=>typeof v==="string").slice(0,3):[]});
 }
 return map;
}
async function screenDiscoveryChannels(channels: YouTubeChannel[], samples: Map<string,SampleVideo[]>, rejectedExamples: RejectedLearningExample[]) {
 const config=getAIConfiguration();
 if(!config.configured) throw new Error("Configure GEMINI_API_KEY or GROQ_API_KEY. Automatic screening is required; no unassessed channels will be saved.");
 const limited=channels.slice(0,MAX_CHANNELS_PER_AI_SCREEN);
 const combined=new Map<string,Assessment>();
 let providerUsed="";
 const chunks: YouTubeChannel[][]=[];
 for(let i=0;i<limited.length;i+=AI_SCREEN_BATCH_SIZE) chunks.push(limited.slice(i,i+AI_SCREEN_BATCH_SIZE));

 const callGemini=async(prompt:string,ids:string[])=>{
  const model=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
  const res=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY!},body:JSON.stringify({model,input:prompt,system_instruction:assessmentRules,response_format:{type:"text",mime_type:"application/json"},generation_config:{temperature:0.1,max_output_tokens:2048,thinking_level:"minimal"},store:false}),signal:AbortSignal.timeout(60000)});
  const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data?.error?.message||data?.message||"Gemini screening failed.");
  const out=typeof data?.output_text==="string"?data.output_text:(Array.isArray(data?.steps)?data.steps.filter((s:{type?:string})=>s?.type==="model_output").flatMap((s:{content?:Array<{type?:string;text?:string}>})=>Array.isArray(s.content)?s.content:[]).filter((p:{type?:string;text?:string})=>p?.type==="text"&&typeof p.text==="string").map((p:{text:string})=>p.text).join("\\n"):"");
  if(!out) throw new Error("Gemini Interactions API returned an empty screening result.");
  const assessments=parseAssessments(out,ids);
  if(ids.some(id=>!assessments.has(id))) throw new Error("Gemini returned incomplete channel assessments; retry discovery.");
  return {assessments,provider:model};
 };
 const callGroq=async(prompt:string,ids:string[])=>{
  const model=process.env.GROQ_MODEL||"llama-3.3-70b-versatile";
  let res: Response;
  let data: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 2; attempt++) {
   const retryingWithoutJsonMode = attempt === 1;
    res=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.GROQ_API_KEY!},body:JSON.stringify({model,temperature:0.1,max_tokens:800,...(retryingWithoutJsonMode?{}:{response_format:{type:"json_object"}}),messages:[{role:"system",content:assessmentRules+" Output a valid JSON object only. No markdown or commentary."},{role:"user",content:prompt+"\nReturn exactly the assessments JSON shape requested in the system instruction."}]}),signal:AbortSignal.timeout(60000)});
   data=asRecord(await res.json().catch(()=>({})));
   if(res.ok) break;
   const errorText=String(asRecord(data.error).message||"");
   if(attempt===0 && res.status===400 && /failed_generation|failed to generate json/i.test(errorText)) continue;
   if(res.status!==429 || attempt===1) {
    const errorMessage=asRecord(data.error).message;
    const error=new Error((typeof errorMessage==="string"?errorMessage:undefined)||"Groq screening failed ("+res.status+").") as Error & {status?:number;retryAfter?:string};
    error.status=res.status; error.retryAfter=res.headers.get("retry-after")||undefined; throw error;
   }
   const retryAfter=Number(res.headers.get("retry-after")||"10");
   const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter,30):10;
   await new Promise(resolve=>setTimeout(resolve,delay*1000));
  }
  const choices: unknown[]=Array.isArray(data.choices)?data.choices:[];
  const content=asRecord(asRecord(choices[0]).message).content;
  if(typeof content!=="string"||!content) throw new Error("Groq returned an empty screening result.");
  const assessments=parseAssessments(content,ids);
  if(ids.some(id=>!assessments.has(id))) throw new Error("Groq returned incomplete channel assessments; retry discovery.");
  return {assessments,provider:model};
 };

 for(const chunk of chunks) {
  const ids=chunk.map(c=>c.id);
  const content=chunk.map(c=>JSON.stringify({
   channelId:c.id,
   title:(c.snippet?.title??"").slice(0,160),
   description:(c.snippet?.description??"").slice(0,500),
   sampleVideos:(samples.get(c.id)??[]).slice(0,3).map(v=>({
    title:v.title.slice(0,140),
    description:v.description.slice(0,180),
    matchedQuery:v.matchedQuery.slice(0,60)
   }))
  })).join("\n");
  const learningContext = rejectedExamples.length ? "\n\nUSER-REJECTED EXAMPLES FROM PREVIOUS REVIEWS (learn the exclusion patterns):\n" + JSON.stringify(rejectedExamples) + "\nUse these as negative examples. Identify recurring traits that explain why they do not fit AI tools/technology coverage or practical AI system design education. Apply those traits to new candidates only when supported by evidence. Do not reject a candidate merely because it shares a company, tool, or broad topic; judge actual content. Exact previously rejected channel IDs are excluded before screening." : "";
  const prompt="Assess these "+chunk.length+" channels using only the compact public metadata below. Return every supplied channelId exactly once. Keep each reason under 20 words and evidence to at most 1 short item. Be consistent with the prior user rejection examples when relevant.\n"+content+learningContext;
  let result:{assessments:Map<string,Assessment>;provider:string};
  try {
   if(config.available.includes("gemini")) result=await callGemini(prompt,ids);
   else result=await callGroq(prompt,ids);
  } catch(firstError) {
   const fallback=config.available.includes("gemini")?"groq":"gemini";
   if(!config.available.includes(fallback)) throw firstError;
   // Gemini is preferred for discovery; Groq is a fallback only when Gemini is unavailable or fails.
   result=fallback==="groq"?await callGroq(prompt,ids):await callGemini(prompt,ids);
  }
  providerUsed=result.provider;
  for(const [id,assessment] of result.assessments) combined.set(id,assessment);
 }
 return {assessments:combined,provider:providerUsed};
}

async function reserveQuota(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, bucket: "search" | "general") {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("reserve_youtube_quota", { p_bucket: bucket, p_amount: 1 });
  if (error) throw new Error(`Quota tracker unavailable. Run the latest Supabase SQL migration. ${error.message}`);
  return data as QuotaReservation;
}

async function youtubeGet<T>(resource: string, params: Record<string, string>) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YouTube Data API key is not configured.");
  const url = new URL(`${YOUTUBE_API}/${resource}`);
  for (const [key, value] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload?.error?.errors?.[0]?.reason;
    if (response.status === 403 && reason === "quotaExceeded") throw new Error("YouTube API daily quota is exhausted. Try again after the quota resets.");
    if (response.status === 403) throw new Error("YouTube API access was denied. Check API enablement and key restrictions.");
    throw new Error(payload?.error?.message || `YouTube API request failed (${response.status}).`);
  }
  return payload as T;
}


export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!process.env.YOUTUBE_API_KEY) return NextResponse.json({ error: "YOUTUBE_API_KEY is not configured on the server." }, { status: 503 });

  let body: { keywords?: unknown; language?: unknown; mode?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const language = body.language === "en" ? "en" : body.language === "hi" ? "hi" : null;
  const keywords = Array.isArray(body.keywords)
    ? [...new Set(body.keywords.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];
  const mode = body.mode === "scan" ? "scan" : body.mode === "discover" ? "discover" : null;\n  if (!mode) return NextResponse.json({ error: "Choose discovery mode: discover or scan." }, { status: 400 });\n  if (!language || keywords.length === 0 || keywords.some((keyword) => keyword.length > 80)) {
    return NextResponse.json({ error: `Provide language "hi" or "en" and at least one keyword (maximum 80 characters each).` }, { status: 400 });
  }

  // YouTube search.list costs 100 quota units per request. Pack phrases
  // together only after reserving space for exclusions, so every final q fits.
  const MAX_SEARCH_REQUESTS = 6;
  const MAX_QUERY_LENGTH = 450;
  // Keep high-signal exclusions compact to preserve room for the user's topics.
  const excludedSearchTerms = [
    '-kids', '-cartoon', '-nursery', '-rhymes', '-trading', '-nifty', '-sensex',
    '-intraday', '-"stock market"', '-"share market"', '-"options trading"', '-"investment tips"'
  ].join(" ");
  const availableKeywordLength = MAX_QUERY_LENGTH - excludedSearchTerms.length - 1;
  const searchQueries: string[] = [];
  let queryTerms: string[] = [];
  for (const keyword of keywords) {
    const term = `"${keyword.replace(/"/g, "").trim()}"`;
    const candidate = [...queryTerms, term].join("|");
    if (candidate.length > availableKeywordLength && queryTerms.length) {
      searchQueries.push(queryTerms.join("|") + " " + excludedSearchTerms);
      queryTerms = [term];
    } else {
      queryTerms.push(term);
    }
  }
  if (queryTerms.length) searchQueries.push(queryTerms.join("|") + " " + excludedSearchTerms);
  if (searchQueries.some((query) => query.length > MAX_QUERY_LENGTH)) {
    return NextResponse.json({ error: "A keyword is too long to fit the YouTube query limit alongside the safety exclusions. Shorten that keyword.", maximumQueryLength: MAX_QUERY_LENGTH }, { status: 400 });
  }
  if (searchQueries.length > MAX_SEARCH_REQUESTS) {
    return NextResponse.json({
      error: `These keywords require ${searchQueries.length} search groups. The current quota-aware limit is ${MAX_SEARCH_REQUESTS} groups (up to ${MAX_SEARCH_REQUESTS * 100} YouTube search quota units). Remove a few keywords or split discovery into multiple runs.`,
      searchGroupsRequired: searchQueries.length,
      maximumSearchRequests: MAX_SEARCH_REQUESTS,
    }, { status: 400 });
  }

  const { count, error: countError } = await supabase.from("competitors").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_active", true);
  if (countError) return NextResponse.json({ error: "Could not check your active competitor limit." }, { status: 500 });

  try {
    const samplesByChannel = new Map<string, SampleVideo[]>();
    const channelIds = new Set<string>();

    // Search for videos that indicate the desired format, not channels merely discussing AI.
    // OR-grouping preserves keyword coverage while reducing 30+ requests to at most four.
    for (const searchQuery of searchQueries) {
      const reservation = await reserveQuota(supabase, "search");
      if (!reservation.allowed) return NextResponse.json({ error: "Daily YouTube search request limit reached.", quota: reservation }, { status: 429 });
      const search = await youtubeGet<{ items?: Array<{ id?: { videoId?: string }; snippet?: { channelId?: string; title?: string; description?: string; channelTitle?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } } }> }>("search", {
        part: "snippet", type: "video", maxResults: "25", q: searchQuery, relevanceLanguage: language, order: "date", videoDuration: "medium",
      });
      for (const item of search.items ?? []) {
        const channelId = item.snippet?.channelId;
        if (!channelId) continue;
        channelIds.add(channelId);
        const videoId = item.id?.videoId ?? null;
        const sample: SampleVideo = {
          videoId,
          title: item.snippet?.title ?? "",
          description: (item.snippet?.description ?? "").slice(0, 1200),
          channelTitle: item.snippet?.channelTitle ?? "",
          publishedAt: item.snippet?.publishedAt ?? null,
          thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
          matchedQuery: searchQuery,
          videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
        };
        const list = samplesByChannel.get(channelId) ?? [];
        if (list.length < 5 && !list.some((video) => video.videoId === videoId)) list.push(sample);
        samplesByChannel.set(channelId, list);
      }
    }

    const ids = [...channelIds];
    const channels: YouTubeChannel[] = [];
    for (let index = 0; index < ids.length; index += 50) {
      const reservation = await reserveQuota(supabase, "general");
      if (!reservation.allowed) return NextResponse.json({ error: "Daily YouTube general API quota limit reached.", quota: reservation }, { status: 429 });
      const result = await youtubeGet<{ items?: YouTubeChannel[] }>("channels", {
        part: "snippet,statistics", id: ids.slice(index, index + 50).join(","), maxResults: "50",
      });
      channels.push(...(result.items ?? []));
    }

    // Load the user's prior rejected decisions as persistent negative feedback.
    const { data: rejectedRows, error: rejectedError } = await supabase.from("competitors")
      .select("youtube_channel_id,channel_title,description,ai_production_review_note,ai_production_evidence")
      .eq("owner_id", user.id).eq("ai_production_status", "rejected")
      .order("ai_production_reviewed_at", { ascending: false }).limit(30);
    if (rejectedError) return NextResponse.json({ error: "Could not load prior rejection feedback.", details: rejectedError.message }, { status: 500 });

    const rejectedIds = new Set((rejectedRows ?? []).map((row) => row.youtube_channel_id));
    const rejectedExamples: RejectedLearningExample[] = (rejectedRows ?? []).slice(0, 4).map((row) => {
      const evidence = row.ai_production_evidence && typeof row.ai_production_evidence === "object"
        ? row.ai_production_evidence as Record<string, unknown> : {};
      return {
        channelTitle: row.channel_title.slice(0, 80),
        description: typeof row.description === "string" ? row.description.slice(0, 100) : null,
        reviewNote: typeof row.ai_production_review_note === "string" ? row.ai_production_review_note.slice(0, 80) : null,
        confidenceScore: typeof evidence.confidenceScore === "number" ? evidence.confidenceScore : undefined,
        nicheRelevance: typeof evidence.nicheRelevance === "number" ? evidence.nicheRelevance : undefined,
      };
    });

    // Manually reviewed channels are already approved; never spend AI screening calls on them.
    const { data: manualPriorityRows, error: manualPriorityError } = await supabase.from("competitors")
      .select("youtube_channel_id").eq("owner_id", user.id).eq("is_manual_priority", true);
    if (manualPriorityError) return NextResponse.json({ error: "Could not load manual priority channels.", details: manualPriorityError.message }, { status: 500 });
    const manualPriorityIds = new Set((manualPriorityRows ?? []).map((row) => row.youtube_channel_id));

    // Exclude channels whose own identity clearly belongs to a disallowed vertical.
    // A single off-topic sample is not enough to reject a mixed-topic creator.
    const hardExcludedTopic = /\b(?:kids?|children|childrens|nursery|cartoons?|toy unboxing|toy reviews?|preschool|baby songs?|बालगीत|बच्चों|बच्चो|stock market|share market|stock trading|share trading|trading|day trading|intraday|nifty|sensex|options trading|crypto trading|investing|investment tips|stock tips|शेयर बाजार|शेयर मार्केट|स्टॉक मार्केट|ट्रेडिंग)\b/i;
    const topicExcludedIds = new Set(channels.filter((channel) =>
      hardExcludedTopic.test((channel.snippet?.title ?? "") + " " + (channel.snippet?.description ?? ""))
    ).map((channel) => channel.id));
    const candidates = channels
      .filter((channel) => channel.id && channel.snippet?.title && !rejectedIds.has(channel.id) && !manualPriorityIds.has(channel.id) && !topicExcludedIds.has(channel.id))
      .sort((a, b) => (samplesByChannel.get(b.id)?.length ?? 0) - (samplesByChannel.get(a.id)?.length ?? 0));
    const { assessments, provider: screeningProvider } = await screenDiscoveryChannels(candidates, samplesByChannel, rejectedExamples);
    const eligible = candidates.filter((channel) => {
      const assessment = assessments.get(channel.id);
      return Boolean(assessment && assessment.confidenceScore >= MIN_DISCOVERY_SCORE && assessment.nicheRelevance >= MIN_DISCOVERY_SCORE && assessment.recommendation !== "unlikely_match");
    });

    // Snapshot prior automatic rows. Scan mode removes stale automatic rows
    // only after the replacement candidate batch has been saved successfully.
    const { data: priorAutomaticRows, error: priorAutomaticError } = mode === "scan"
      ? await supabase.from("competitors").select("id,youtube_channel_id")
          .eq("owner_id", user.id).eq("is_manual_priority", false)
      : { data: [], error: null };
    if (priorAutomaticError) return NextResponse.json({ error: "Could not prepare a safe fresh scan.", details: priorAutomaticError.message }, { status: 500 });
    let removedAutomaticChannels = 0;

    const discoveredIds = candidates.map((channel) => channel.id);
    const { data: existingRows, error: existingError } = discoveredIds.length
      ? await supabase.from("competitors").select("id,youtube_channel_id,ai_production_status,ai_production_evidence,is_active,user_tracking_preference,discovery_count").eq("owner_id", user.id).in("youtube_channel_id", discoveredIds)
      : { data: [], error: null };
    if (existingError) return NextResponse.json({ error: "Could not load saved channel decisions.", details: existingError.message }, { status: 500 });
    const existingById = new Map((existingRows ?? []).map((row) => [row.youtube_channel_id, row]));
    const discoveredAt = new Date().toISOString();
    const rows = candidates.map((channel) => {
      const assessment = assessments.get(channel.id);
      const existing = existingById.get(channel.id);
      const passed = Boolean(assessment && assessment.confidenceScore >= MIN_DISCOVERY_SCORE && assessment.nicheRelevance >= MIN_DISCOVERY_SCORE && assessment.recommendation !== "unlikely_match");
      const oldEvidence = existing?.ai_production_evidence && typeof existing.ai_production_evidence === "object" ? existing.ai_production_evidence as Record<string, unknown> : {};
      const evidence = assessment ? {
        ...oldEvidence, reviewStatus: passed ? "ai_screened_high_confidence" : "ai_filtered",
        explanation: assessment.reason, confidenceScore: assessment.confidenceScore,
        nicheRelevance: assessment.nicheRelevance, recommendation: assessment.recommendation,
        evidence: assessment.evidence, screeningProvider, screenedAt: discoveredAt,
        sampleVideos: samplesByChannel.get(channel.id) ?? oldEvidence.sampleVideos ?? [],
        requiresHumanVerification: true,
      } : { ...oldEvidence, sampleVideos: samplesByChannel.get(channel.id) ?? oldEvidence.sampleVideos ?? [] };
      return {
        owner_id: user.id, youtube_channel_id: channel.id,
        channel_title: channel.snippet?.title ?? "Untitled channel",
        channel_url: channel.snippet?.customUrl ? `https://www.youtube.com/@${channel.snippet.customUrl.replace(/^@/, "")}` : `https://www.youtube.com/channel/${channel.id}`,
        description: channel.snippet?.description ?? null, published_at: channel.snippet?.publishedAt ?? null,
        country: channel.snippet?.country ?? null, language,
        subscriber_count: channel.statistics?.subscriberCount ?? null,
        video_count: channel.statistics?.videoCount ?? null, view_count: channel.statistics?.viewCount ?? null,
        // Preserve all existing manual decisions and active state.
        is_active: existing?.is_active ?? false,
        user_tracking_preference: existing?.user_tracking_preference ?? false,
        ai_production_status: existing?.ai_production_status ?? "needs_review",
        ai_production_evidence: evidence,
        discovery_count: (existing?.discovery_count ?? 0) + 1,
        last_discovered_at: discoveredAt,
        discovery_eligibility: assessment ? (passed ? "eligible" : "filtered") : "pending_screen",
        discovery_reason: assessment?.reason ?? "Not screened in this run.",
        discovery_score: assessment ? Math.min(assessment.confidenceScore, assessment.nicheRelevance) : null,
        last_checked_at: discoveredAt,
      };
    });
    let saved = 0;
    if (rows.length) {
      const { data, error } = await supabase.from("competitors").upsert(rows, { onConflict: "owner_id,youtube_channel_id" }).select("id");
      if (error) return NextResponse.json({ error: "YouTube search succeeded, but saving discovered channels failed.", details: error.message }, { status: 500 });
      saved = data?.length ?? 0;
    }

    if (mode === "scan") {
      const keepIds = new Set(discoveredIds);
      const staleIds = (priorAutomaticRows ?? []).filter(row => !keepIds.has(row.youtube_channel_id)).map(row => row.id);
      for (let index = 0; index < staleIds.length; index += 100) {
        const batch = staleIds.slice(index, index + 100);
        const { data: removed, error: clearError } = await supabase.from("competitors")
          .delete().eq("owner_id", user.id).eq("is_manual_priority", false).in("id", batch).select("id");
        if (clearError) return NextResponse.json({ error: "New channels were saved, but old automatically discovered channels could not be fully cleared.", details: clearError.message, saved, removedAutomaticChannels }, { status: 500 });
        removedAutomaticChannels += removed?.length ?? 0;
      }
    }

    const { data: quota } = await supabase.rpc("get_youtube_quota_status");
    return NextResponse.json({
      searchedKeywords: keywords, searchQueriesUsed: searchQueries, youtubeSearchRequests: searchQueries.length, language, channelsDiscovered: channelIds.size,
      channelsAIassessed: assessments.size,
      channelsExcludedByTopic: topicExcludedIds.size,
      manuallyApprovedChannelsSkipped: manualPriorityIds.size,
      priorRejectedExamplesUsed: rejectedExamples.length,
      previouslyRejectedChannelsSkipped: rejectedIds.size,
      channelsPassingConfidenceThreshold: eligible.length,
      channelsFilteredByAI: candidates.filter((channel) => assessments.has(channel.id) && !eligible.includes(channel)).length,
      channelsPendingScreening: candidates.filter((channel) => !assessments.has(channel.id)).length,
      mode, removedAutomaticChannels,\n      minimumConfidenceScore: MIN_DISCOVERY_SCORE,
      minimumNicheRelevance: MIN_DISCOVERY_SCORE,
      screeningProvider,
      channelsWithinAgeRange: eligible.length, saved, candidatesSaved: saved, sampleEvidenceRefreshed: candidates.filter((channel) => (samplesByChannel.get(channel.id)?.length ?? 0) > 0).length, activeCompetitorCount: count ?? 0,
      activeCompetitorLimit: MAX_ACTIVE_COMPETITORS, ageFilter: "No channel-age restriction; global discovery.",
      screeningLimitPerRun: MAX_CHANNELS_PER_AI_SCREEN,
      screeningBatchSize: AI_SCREEN_BATCH_SIZE,
      qualification: "Discovery targets professional AI engineers, LLM engineers, AI/solutions architects, AI engineering managers and production AI platform teams. Children/entertainment and finance/trading verticals are excluded by search terms and channel metadata; only strong evidence-backed technical matches pass AI screening. AI-production style still requires human verification.",
      quotaNote: "This dashboard tracks requests made through this app only. Other apps using the same Google Cloud project also consume its quota.",
      quota: quota ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected YouTube discovery error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
