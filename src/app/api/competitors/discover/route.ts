import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAIConfiguration } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const MAX_ACTIVE_COMPETITORS = 100;
const MAX_CHANNELS_PER_AI_SCREEN = 8;
const AI_SCREEN_BATCH_SIZE = 2;
const MIN_DISCOVERY_SCORE = 81;

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
const assessmentRules = "You are a strict channel research analyst for AIWithBh@i. Target: technical education and real-world case studies about AI systems for IT professionals: AI system design, LLM application architecture, RAG, vector databases, AI agents/orchestration, production AI engineering, inference/model serving, AI infrastructure, evaluation, observability, reliability, security and enterprise AI implementations. Official channels from Anthropic, Meta, Groq, OpenAI, DeepSeek, AWS, Databricks, Snowflake, NVIDIA, Palantir, CrowdStrike, Apple, Alphabet/Google and Tesla can qualify as primary sources only when their sample videos directly cover their AI technology, engineering, research or implementation. Reject children's entertainment, nursery rhymes, songs, gaming, lifestyle, generic entertainment, unrelated tutorials and channels with only incidental AI mentions. Never infer fit from subscriber count or channel name alone. For each channel provide confidenceScore 0-100 (confidence it genuinely fits), nicheRelevance 0-100, recommendation strong_candidate/possible_candidate/unlikely_match, concise reason, and up to 3 evidence items. Be conservative: weak or ambiguous evidence must score 80 or below. Return ONLY JSON in this shape: {\"assessments\":[{\"channelId\":\"...\",\"confidenceScore\":0,\"nicheRelevance\":0,\"recommendation\":\"unlikely_match\",\"reason\":\"...\",\"evidence\":[\"...\"]}]}. Include every channelId exactly once.";
function parseAssessments(raw: string, ids: string[]) {
 const cleaned=raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
 const parsed=JSON.parse(cleaned); const map=new Map<string,Assessment>();
 for(const x of (Array.isArray(parsed.assessments)?parsed.assessments:[])) {
  if(!ids.includes(x.channelId)||map.has(x.channelId)) continue;
  const n=(v:unknown)=>Math.max(0,Math.min(100,Math.round(Number(v)||0)));
  map.set(x.channelId,{channelId:x.channelId,confidenceScore:n(x.confidenceScore),nicheRelevance:n(x.nicheRelevance),recommendation:["strong_candidate","possible_candidate","unlikely_match"].includes(x.recommendation)?x.recommendation:"unlikely_match",reason:typeof x.reason==="string"?x.reason.slice(0,500):"No reason supplied.",evidence:Array.isArray(x.evidence)?x.evidence.filter((v:unknown)=>typeof v==="string").slice(0,3):[]});
 }
 return map;
}
async function screenDiscoveryChannels(channels: YouTubeChannel[], samples: Map<string,SampleVideo[]>) {
 const config=getAIConfiguration();
 if(!config.configured) throw new Error("Configure GEMINI_API_KEY or GROQ_API_KEY. Automatic screening is required; no unassessed channels will be saved.");
 const limited=channels.slice(0,MAX_CHANNELS_PER_AI_SCREEN);
 const combined=new Map<string,Assessment>();
 let providerUsed="";
 const chunks: YouTubeChannel[][]=[];
 for(let i=0;i<limited.length;i+=AI_SCREEN_BATCH_SIZE) chunks.push(limited.slice(i,i+AI_SCREEN_BATCH_SIZE));

 const callGemini=async(prompt:string,ids:string[])=>{
  const model=process.env.GEMINI_MODEL||"gemini-2.5-flash-lite";
  const res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY!},body:JSON.stringify({systemInstruction:{parts:[{text:assessmentRules}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.1,maxOutputTokens:2048}}),signal:AbortSignal.timeout(60000)});
  const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data?.error?.message||"Gemini screening failed.");
  const out=data?.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text??"").join(""); if(!out) throw new Error("Gemini returned an empty screening result.");
  return {assessments:parseAssessments(out,ids),provider:model};
 };
 const callGroq=async(prompt:string,ids:string[])=>{
  const model=process.env.GROQ_MODEL||"openai/gpt-oss-120b";
  const res=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.GROQ_API_KEY!},body:JSON.stringify({model,temperature:0.1,max_tokens:1200,response_format:{type:"json_object"},messages:[{role:"system",content:assessmentRules},{role:"user",content:prompt}]}),signal:AbortSignal.timeout(60000)});
  const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data?.error?.message||"Groq screening failed.");
  const out=data?.choices?.[0]?.message?.content; if(!out) throw new Error("Groq returned an empty screening result.");
  return {assessments:parseAssessments(out,ids),provider:model};
 };

 for(const chunk of chunks) {
  const ids=chunk.map(c=>c.id);
  const content=chunk.map(c=>JSON.stringify({
   channelId:c.id,
   title:(c.snippet?.title??"").slice(0,160),
   description:(c.snippet?.description??"").slice(0,500),
   sampleVideos:(samples.get(c.id)??[]).slice(0,2).map(v=>({
    title:v.title.slice(0,180),
    description:v.description.slice(0,180),
    matchedQuery:v.matchedQuery.slice(0,100)
   }))
  })).join("\n");
  const prompt="Assess these "+chunk.length+" channels using only the compact public metadata below. Return every supplied channelId exactly once. Keep each reason under 35 words and evidence to at most 2 short items.\n"+content;
  let result:{assessments:Map<string,Assessment>;provider:string};
  try {
   if(config.primary==="groq"&&config.available.includes("groq")) result=await callGroq(prompt,ids);
   else if(config.available.includes("gemini")) result=await callGemini(prompt,ids);
   else result=await callGroq(prompt,ids);
  } catch(firstError) {
   const fallback=config.primary==="gemini"?"groq":"gemini";
   if(!config.available.includes(fallback)) throw firstError;
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

  let body: { keywords?: unknown; language?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const language = body.language === "en" ? "en" : body.language === "hi" ? "hi" : null;
  const keywords = Array.isArray(body.keywords)
    ? [...new Set(body.keywords.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];
  if (!language || keywords.length === 0 || keywords.some((keyword) => keyword.length > 80)) {
    return NextResponse.json({ error: `Provide language "hi" or "en" and at least one keyword (maximum 80 characters each).` }, { status: 400 });
  }

  const { count, error: countError } = await supabase.from("competitors").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_active", true);
  if (countError) return NextResponse.json({ error: "Could not check your active competitor limit." }, { status: 500 });
  const remaining = Math.max(0, MAX_ACTIVE_COMPETITORS - (count ?? 0));
  if (remaining === 0) return NextResponse.json({ error: "You already have 100 active competitors. Deactivate one before discovering more.", activeLimit: MAX_ACTIVE_COMPETITORS }, { status: 409 });

  try {
    const samplesByChannel = new Map<string, SampleVideo[]>();
    const channelIds = new Set<string>();

    // Search for videos that indicate the desired format, not channels merely discussing AI.
    for (const keyword of keywords) {
      const reservation = await reserveQuota(supabase, "search");
      if (!reservation.allowed) return NextResponse.json({ error: "Daily YouTube search request limit reached.", quota: reservation }, { status: 429 });
      const search = await youtubeGet<{ items?: Array<{ id?: { videoId?: string }; snippet?: { channelId?: string; title?: string; description?: string; channelTitle?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } } }> }>("search", {
        part: "snippet", type: "video", maxResults: "25", q: keyword, relevanceLanguage: language, order: "relevance", videoDuration: "medium",
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
          matchedQuery: keyword,
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

    const candidates = channels
      .filter((channel) => channel.id && channel.snippet?.title)
      .sort((a, b) => (samplesByChannel.get(b.id)?.length ?? 0) - (samplesByChannel.get(a.id)?.length ?? 0));
    const { assessments, provider: screeningProvider } = await screenDiscoveryChannels(candidates, samplesByChannel);
    const eligible = candidates.filter((channel) => {
      const assessment = assessments.get(channel.id);
      return Boolean(assessment && assessment.confidenceScore >= MIN_DISCOVERY_SCORE && assessment.nicheRelevance >= MIN_DISCOVERY_SCORE && assessment.recommendation === "strong_candidate");
    });

    const rows = eligible.slice(0, remaining).map((channel) => {
      const assessment = assessments.get(channel.id)!;
      return ({
      owner_id: user.id,
      youtube_channel_id: channel.id,
      channel_title: channel.snippet?.title ?? "Untitled channel",
      channel_url: channel.snippet?.customUrl ? `https://www.youtube.com/@${channel.snippet.customUrl.replace(/^@/, "")}` : `https://www.youtube.com/channel/${channel.id}`,
      description: channel.snippet?.description ?? null,
      published_at: channel.snippet?.publishedAt ?? null,
      country: channel.snippet?.country ?? null,
      language,
      subscriber_count: channel.statistics?.subscriberCount ?? null,
      video_count: channel.statistics?.videoCount ?? null,
      view_count: channel.statistics?.viewCount ?? null,
      is_active: false,
      ai_production_status: "needs_review",
      ai_production_evidence: {
        reviewStatus: "ai_screened_high_confidence",
        explanation: assessment.reason,
        confidenceScore: assessment.confidenceScore,
        nicheRelevance: assessment.nicheRelevance,
        recommendation: assessment.recommendation,
        evidence: assessment.evidence,
        screeningProvider,
        screenedAt: new Date().toISOString(),
        sampleVideos: samplesByChannel.get(channel.id) ?? [],
        requiresHumanVerification: true,
      },
      last_checked_at: new Date().toISOString(),
    }); });

    let saved = 0;
    if (rows.length) {
      const { data, error } = await supabase.from("competitors")
        .upsert(rows, { onConflict: "owner_id,youtube_channel_id", ignoreDuplicates: true }).select("id");
      if (error) return NextResponse.json({ error: "YouTube search succeeded, but saving competitors failed.", details: error.message }, { status: 500 });
      saved = data?.length ?? 0;
    }

    // Refresh sample-video evidence for channels that were already saved.
    // The original upsert intentionally ignores duplicates so it cannot reset
    // a user's manual qualification/rejection decision.
    const eligibleIds = eligible.map((channel) => channel.id);
    if (eligibleIds.length) {
      const { data: existingRows, error: existingError } = await supabase.from("competitors")
        .select("id,youtube_channel_id,ai_production_evidence")
        .eq("owner_id", user.id).in("youtube_channel_id", eligibleIds);
      if (existingError) return NextResponse.json({ error: "Channels were discovered, but sample-video evidence could not be refreshed.", details: existingError.message }, { status: 500 });
      for (const row of existingRows ?? []) {
        const newSamples = samplesByChannel.get(row.youtube_channel_id) ?? [];
        if (!newSamples.length) continue;
        const oldEvidence = row.ai_production_evidence && typeof row.ai_production_evidence === "object"
          ? row.ai_production_evidence as Record<string, unknown> : {};
        const mergedEvidence = {
          ...oldEvidence,
          sampleVideos: newSamples,
          sampleVideosRefreshedAt: new Date().toISOString(),
          requiresHumanVerification: true,
        };
        const { error: evidenceError } = await supabase.from("competitors")
          .update({ ai_production_evidence: mergedEvidence })
          .eq("id", row.id).eq("owner_id", user.id);
        if (evidenceError) return NextResponse.json({ error: "Could not update sample-video evidence for an existing channel.", details: evidenceError.message }, { status: 500 });
      }
    }

    const { data: quota } = await supabase.rpc("get_youtube_quota_status");
    return NextResponse.json({
      searchedKeywords: keywords, language, channelsDiscovered: channelIds.size,
      channelsAIassessed: assessments.size,
      channelsPassingConfidenceThreshold: eligible.length,
      minimumConfidenceScore: MIN_DISCOVERY_SCORE,
      minimumNicheRelevance: MIN_DISCOVERY_SCORE,
      screeningProvider,
      channelsWithinAgeRange: eligible.length, saved, candidatesSaved: saved, sampleEvidenceRefreshed: eligible.slice(0, remaining).filter((channel) => (samplesByChannel.get(channel.id)?.length ?? 0) > 0).length, activeCompetitorCount: count ?? 0,
      activeCompetitorLimit: MAX_ACTIVE_COMPETITORS, ageFilter: "No channel-age restriction; global discovery.",
      screeningLimitPerRun: MAX_CHANNELS_PER_AI_SCREEN,
      qualification: "Only strong candidates with confidence and niche relevance scores above 80 are saved. AI-production style still requires human verification.",
      quotaNote: "This dashboard tracks requests made through this app only. Other apps using the same Google Cloud project also consume its quota.",
      quota: quota ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected YouTube discovery error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
