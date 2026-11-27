import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: competitors, error } = await supabase.from("competitors")
    .select("id,channel_title,channel_url,subscriber_count,video_count,view_count,last_checked_at,ai_production_status,ai_production_evidence")
    .eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified")
    .order("subscriber_count", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Could not load competitor metrics.", details: error.message }, { status: 500 });
  if (!competitors?.length) return NextResponse.json({ analytics: [], summary: { tracked: 0, growing: 0, declining: 0, totalSubscribers: 0, videosSampled: 0 } });

  const ids = competitors.map((item) => item.id);
  const [channelHistory, videoRows] = await Promise.all([
    supabase.from("competitor_snapshots").select("competitor_id,subscriber_count,view_count,captured_at").in("competitor_id", ids).order("captured_at", { ascending: false }),
    supabase.from("videos").select("id,competitor_id,youtube_video_id,title,description,view_count,published_at,is_short,video_url,thumbnail_url").in("competitor_id", ids).eq("is_niche_relevant", true).order("published_at", { ascending: false }),
  ]);
  if (channelHistory.error || videoRows.error) return NextResponse.json({ error: "Could not load analytics history.", details: channelHistory.error?.message ?? videoRows.error?.message }, { status: 500 });

  const historyById = new Map<string, typeof channelHistory.data>();
  for (const row of channelHistory.data ?? []) historyById.set(row.competitor_id, [...(historyById.get(row.competitor_id) ?? []), row]);
  const videosById = new Map<string, typeof videoRows.data>();
  for (const row of videoRows.data ?? []) if (row.competitor_id) videosById.set(row.competitor_id, [...(videosById.get(row.competitor_id) ?? []), row]);

  const analytics = competitors.map((competitor) => {
    const history = historyById.get(competitor.id) ?? [];
    const recent = history[0];
    const previous = history.find((item) => recent && new Date(recent.captured_at).getTime() - new Date(item.captured_at).getTime() >= 6 * 86400000);
    const currentSubs = Number(competitor.subscriber_count ?? 0);
    const previousSubs = Number(previous?.subscriber_count ?? currentSubs);
    const subscriberDelta = currentSubs - previousSubs;
    const growthPercent = previousSubs > 0 ? subscriberDelta / previousSubs * 100 : null;
    const videos = videosById.get(competitor.id) ?? [];
    const dated = videos.filter((video) => video.published_at).map((video) => new Date(video.published_at as string).getTime()).filter(Number.isFinite).sort((a,b)=>b-a);
    const intervals = dated.slice(0, 8).slice(1).map((time,index)=>(dated[index]-time)/86400000);
    const uploadIntervalDays = intervals.length ? intervals.reduce((a,b)=>a+b,0)/intervals.length : null;
    const averageViews = videos.length ? Math.round(videos.reduce((sum,video)=>sum+Number(video.view_count??0),0)/videos.length) : 0;
    const evidence = competitor.ai_production_evidence && typeof competitor.ai_production_evidence === "object"
      ? competitor.ai_production_evidence as { aiScreening?: Record<string, unknown> }
      : {};
    const ai = evidence.aiScreening ?? {};
    const visual = Math.max(0, Math.min(100, Number(ai.syntheticVisualStyleLikelihood) || 0));
    const faceless = Math.max(0, Math.min(100, Number(ai.facelessFormatLikelihood) || 0));
    const relevance = Math.max(0, Math.min(100, Number(ai.nicheFitScore ?? ai.industrialRelevance) || 0));
    const screenedAt = typeof ai.screenedAt === "string" ? ai.screenedAt : null;
    const nicheScreeningCurrent = ai.nicheVersion === "aiwithbhai-ai-systems-v1";
    const nicheFitScore = nicheScreeningCurrent ? relevance : null;
    const consistency = uploadIntervalDays === null ? 0 : Math.max(0, Math.min(100, 100 - Math.max(0, uploadIntervalDays - 7) * 4));
    const growth = growthPercent === null ? 0 : Math.max(0, Math.min(100, 50 + growthPercent * 5));
    const aiProductionScore = Math.round(relevance * .50 + visual * .15 + faceless * .10 + consistency * .15 + growth * .10);
    const score = Math.round(Math.max(0,Math.min(100,
      (growthPercent === null ? 0 : Math.max(0,Math.min(35,growthPercent*5))) +
      (averageViews > 0 ? Math.min(30,Math.log10(averageViews+1)*5) : 0) +
      (uploadIntervalDays === null ? 0 : Math.max(0,25-Math.max(0,uploadIntervalDays-7)*1.5)) +
      (videos.length >= 5 ? 10 : videos.length*2)
    )));
    const explorerEvidence = competitor.ai_production_evidence && typeof competitor.ai_production_evidence === "object"
      ? competitor.ai_production_evidence as { sampleVideos?: Array<{ videoId?: string | null; title?: string; videoUrl?: string | null; thumbnailUrl?: string | null; matchedQuery?: string }> }
      : {};
    const recommendedIds = new Set((explorerEvidence.sampleVideos ?? []).map((sample) => sample.videoId).filter((id): id is string => Boolean(id)));
    const recommendedVideos = videos.filter((video) => recommendedIds.has(video.youtube_video_id)).map((video) => {
      const source = (explorerEvidence.sampleVideos ?? []).find((sample) => sample.videoId === video.youtube_video_id);
      return { id: video.youtube_video_id, title: video.title, views: Number(video.view_count ?? 0), publishedAt: video.published_at, isShort: video.is_short, url: video.video_url ?? "https://www.youtube.com/watch?v=" + video.youtube_video_id, thumbnailUrl: video.thumbnail_url, matchedQuery: source?.matchedQuery ?? null };
    });
    const shorts = videos.filter(video => video.is_short);
    const longVideos = videos.filter(video => !video.is_short);
    const formatBreakdown = {
      shorts: { count: shorts.length, averageViews: shorts.length ? Math.round(shorts.reduce((sum, video) => sum + Number(video.view_count ?? 0), 0) / shorts.length) : 0 },
      longForm: { count: longVideos.length, averageViews: longVideos.length ? Math.round(longVideos.reduce((sum, video) => sum + Number(video.view_count ?? 0), 0) / longVideos.length) : 0 },
    };
    const topicRules = [
      ["RAG & retrieval", /\b(rag|retrieval|embedding|vector database|vector db|semantic search)\b/i],
      ["AI agents", /\b(agent|agentic|multi-agent|tool calling|orchestration)\b/i],
      ["AI architecture", /\b(architecture|system design|enterprise|copilot|workflow)\b/i],
      ["LLMOps & evaluation", /\b(llmops|evaluation|observability|tracing|monitoring|benchmark)\b/i],
      ["Inference & infrastructure", /\b(inference|serving|gpu|quantization|vllm|latency)\b/i],
      ["AI security", /\b(security|guardrail|safety|governance|prompt injection)\b/i],
      ["AI developer tools", /\b(api|sdk|framework|langchain|llamaindex|developer tool|coding assistant)\b/i],
    ] as const;
    const topicBreakdown = topicRules.map(([topic, pattern]) => {
      const matches = videos.filter(video => pattern.test((video.title ?? "") + " " + (video.description ?? "")));
      return { topic, count: matches.length, averageViews: matches.length ? Math.round(matches.reduce((sum, video) => sum + Number(video.view_count ?? 0), 0) / matches.length) : 0 };
    }).filter(item => item.count > 0).sort((a,b) => b.count-a.count).slice(0,5);
    const topVideos = videos.slice().sort((a,b)=>Number(b.view_count??0)-Number(a.view_count??0)).slice(0,3)
      .map(video=>({title:video.title,views:Number(video.view_count??0),publishedAt:video.published_at,isShort:video.is_short}));
    return {
      id: competitor.id, title: competitor.channel_title, url: competitor.channel_url,
      aiProductionScore, nicheFitScore, nicheScreeningCurrent, nicheScreenedAt: screenedAt, aiScoreBreakdown: {visual,faceless,relevance,consistency,growth},
      aiRecommendation: typeof ai.recommendation === "string" ? ai.recommendation : "not_screened",
      topVideos, recommendedVideos,
      subscribers: currentSubs, totalViews: Number(competitor.view_count ?? 0),
      subscriberDelta, growthPercent: growthPercent === null ? null : Number(growthPercent.toFixed(2)),
      snapshotCount: history.length, lastSnapshotAt: recent?.captured_at ?? null,
      sampledVideos: videos.length, averageViews, formatBreakdown, topicBreakdown, uploadIntervalDays: uploadIntervalDays === null ? null : Number(uploadIntervalDays.toFixed(1)),
      momentumScore: Math.round(score), trend: subscriberDelta > 0 ? "growing" : subscriberDelta < 0 ? "declining" : "insufficient_data",
      latestVideos: videos.slice(0,5).map(video=>({ title:video.title, views:Number(video.view_count??0), publishedAt:video.published_at, isShort:video.is_short })),
    };
  }).sort((a,b)=>b.momentumScore-a.momentumScore);

  return NextResponse.json({
    analytics,
    summary: {
      tracked: analytics.length,
      growing: analytics.filter((item)=>item.trend==="growing").length,
      declining: analytics.filter((item)=>item.trend==="declining").length,
      totalSubscribers: analytics.reduce((sum,item)=>sum+item.subscribers,0),
      videosSampled: analytics.reduce((sum,item)=>sum+item.sampledVideos,0),
      averageAIProductionScore: analytics.filter((item)=>item.nicheFitScore !== null).length ? Math.round(analytics.filter((item)=>item.nicheFitScore !== null).reduce((sum,item)=>sum+(item.nicheFitScore ?? 0),0)/analytics.filter((item)=>item.nicheFitScore !== null).length) : 0,
      channelsNeedingRescreen: analytics.filter((item)=>!item.nicheScreeningCurrent).length,
    },
    methodology: "Niche fit score is the AI screening relevance score (0–100) based on the channel description and up to five recent public video titles/descriptions, screened against the current AIWithBh@i niche: AI systems architecture and engineering education for IT professionals. Screenings dated before 21 Nov 2026 are marked stale and excluded until re-screened. Visual style, faceless format, upload consistency and growth are separate signals and do not reduce niche fit. Momentum is a separate heuristic, not YouTube Analytics, watch time, revenue, CTR or guaranteed future growth.",
  });
}
