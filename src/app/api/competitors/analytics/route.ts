import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: competitors, error } = await supabase.from("competitors")
    .select("id,channel_title,channel_url,subscriber_count,video_count,view_count,last_checked_at,ai_production_status")
    .eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified")
    .order("subscriber_count", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Could not load competitor metrics.", details: error.message }, { status: 500 });
  if (!competitors?.length) return NextResponse.json({ analytics: [], summary: { tracked: 0, growing: 0, declining: 0, totalSubscribers: 0, videosSampled: 0 } });

  const ids = competitors.map((item) => item.id);
  const [channelHistory, videoRows] = await Promise.all([
    supabase.from("competitor_snapshots").select("competitor_id,subscriber_count,view_count,captured_at").in("competitor_id", ids).order("captured_at", { ascending: false }),
    supabase.from("videos").select("id,competitor_id,title,view_count,published_at,is_short").in("competitor_id", ids).order("published_at", { ascending: false }),
  ]);
  if (channelHistory.error || videoRows.error) return NextResponse.json({ error: "Could not load analytics history.", details: channelHistory.error?.message ?? videoRows.error?.message }, { status: 500 });

  const historyById = new Map<string, typeof channelHistory.data>();
  for (const row of channelHistory.data ?? []) historyById.set(row.competitor_id, [...(historyById.get(row.competitor_id) ?? []), row]);
  const videosById = new Map<string, typeof videoRows.data>();
  for (const row of videoRows.data ?? []) if (row.competitor_id) videosById.set(row.competitor_id, [...(videosById.get(row.competitor_id) ?? []), row]);

  const analytics = competitors.map((competitor) => {
    const history = historyById.get(competitor.id) ?? [];
    const recent = history[0];
    const previous = history.find((item) => recent && new Date(item.captured_at).getTime() - new Date(item.captured_at).getTime() >= 0 && new Date(recent.captured_at).getTime() - new Date(item.captured_at).getTime() >= 6 * 86400000);
    const currentSubs = Number(competitor.subscriber_count ?? 0);
    const previousSubs = Number(previous?.subscriber_count ?? currentSubs);
    const subscriberDelta = currentSubs - previousSubs;
    const growthPercent = previousSubs > 0 ? subscriberDelta / previousSubs * 100 : null;
    const videos = videosById.get(competitor.id) ?? [];
    const dated = videos.filter((video) => video.published_at).map((video) => new Date(video.published_at as string).getTime()).filter(Number.isFinite).sort((a,b)=>b-a);
    const intervals = dated.slice(0, 8).slice(1).map((time,index)=>(dated[index]-time)/86400000);
    const uploadIntervalDays = intervals.length ? intervals.reduce((a,b)=>a+b,0)/intervals.length : null;
    const averageViews = videos.length ? Math.round(videos.reduce((sum,video)=>sum+Number(video.view_count??0),0)/videos.length) : 0;
    const score = Math.max(0,Math.min(100,
      (growthPercent === null ? 0 : Math.max(0,Math.min(35,growthPercent*5))) +
      (averageViews > 0 ? Math.min(30,Math.log10(averageViews+1)*5) : 0) +
      (uploadIntervalDays === null ? 0 : Math.max(0,25-Math.max(0,uploadIntervalDays-7)*1.5)) +
      (videos.length >= 5 ? 10 : videos.length*2)
    ));
    return {
      id: competitor.id, title: competitor.channel_title, url: competitor.channel_url,
      subscribers: currentSubs, totalViews: Number(competitor.view_count ?? 0),
      subscriberDelta, growthPercent: growthPercent === null ? null : Number(growthPercent.toFixed(2)),
      snapshotCount: history.length, lastSnapshotAt: recent?.captured_at ?? null,
      sampledVideos: videos.length, averageViews, uploadIntervalDays: uploadIntervalDays === null ? null : Number(uploadIntervalDays.toFixed(1)),
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
    },
    methodology: "Momentum is a heuristic from subscriber change between snapshots, sampled public video views and recent upload spacing. It is not YouTube Analytics, watch time, revenue, CTR or guaranteed future growth. At least two snapshots separated by six days are needed for a meaningful growth comparison.",
  });
}
