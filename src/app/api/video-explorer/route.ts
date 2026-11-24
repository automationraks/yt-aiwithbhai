import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: channels, error: channelError } = await supabase.from("competitors")
    .select("id,channel_title,channel_url,subscriber_count,is_active,ai_production_status")
    .eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified");
  if (channelError) return NextResponse.json({ error: "Could not load active channels.", details: channelError.message }, { status: 500 });
  const ids = (channels ?? []).map((channel) => channel.id);
  if (!ids.length) return NextResponse.json({ videos: [], summary: { activeChannels: 0, matchedVideos: 0, totalViews: 0, totalLikes: 0, totalComments: 0 } });

  const { data: rows, error } = await supabase.from("videos")
    .select("id,competitor_id,youtube_video_id,title,description,published_at,duration_seconds,view_count,like_count,comment_count,is_short,thumbnail_url,video_url,niche_relevance_score,niche_relevance_reason")
    .eq("owner_id", user.id).eq("is_niche_relevant", true).in("competitor_id", ids)
    .order("published_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: "Could not load niche-matched videos. Apply the video niche migration first.", details: error.message }, { status: 500 });
  const channelMap = new Map((channels ?? []).map((channel) => [channel.id, channel]));
  const videos = (rows ?? []).map((video) => ({
    ...video,
    channelTitle: channelMap.get(video.competitor_id ?? "")?.channel_title ?? "Active channel",
    channelUrl: channelMap.get(video.competitor_id ?? "")?.channel_url ?? null,
  }));
  return NextResponse.json({
    videos,
    summary: {
      activeChannels: channels?.length ?? 0,
      matchedVideos: videos.length,
      totalViews: videos.reduce((sum, video) => sum + Number(video.view_count ?? 0), 0),
      totalLikes: videos.reduce((sum, video) => sum + Number(video.like_count ?? 0), 0),
      totalComments: videos.reduce((sum, video) => sum + Number(video.comment_count ?? 0), 0),
    },
  });
}
