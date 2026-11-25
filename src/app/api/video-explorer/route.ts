import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Keep historical video research visible even when a source channel is later
  // removed from the active shortlist or loses its qualified status.
  const { data: channels, error: channelError } = await supabase.from("competitors")
    .select("id,channel_title,channel_url,subscriber_count,is_active,ai_production_status")
    .eq("owner_id", user.id);
  if (channelError) return NextResponse.json({ error: "Could not load channel details.", details: channelError.message }, { status: 500 });

  const activeChannels = (channels ?? []).filter(
    (channel) => channel.is_active && channel.ai_production_status === "qualified"
  );

  // Do not constrain saved videos to active channel IDs. The videos table is
  // the historical record for this owner; refreshes update it but page loads
  // must not hide older records when shortlist membership changes.
  const { data: rows, error } = await supabase.from("videos")
    .select("id,competitor_id,youtube_video_id,title,description,published_at,duration_seconds,view_count,like_count,comment_count,is_short,thumbnail_url,video_url,niche_relevance_score,niche_relevance_reason")
    .eq("owner_id", user.id).eq("is_niche_relevant", true)
    .order("published_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: "Could not load saved niche-matched videos. Apply the video niche migration first.", details: error.message }, { status: 500 });

  const channelMap = new Map((channels ?? []).map((channel) => [channel.id, channel]));
  const videos = (rows ?? []).map((video) => {
    const channel = channelMap.get(video.competitor_id ?? "");
    return {
      ...video,
      channelTitle: channel?.channel_title ?? "Previously tracked channel",
      channelUrl: channel?.channel_url ?? null,
    };
  });

  return NextResponse.json({
    videos,
    summary: {
      activeChannels: activeChannels.length,
      matchedVideos: videos.length,
      totalViews: videos.reduce((sum, video) => sum + Number(video.view_count ?? 0), 0),
      totalLikes: videos.reduce((sum, video) => sum + Number(video.like_count ?? 0), 0),
      totalComments: videos.reduce((sum, video) => sum + Number(video.comment_count ?? 0), 0),
    },
  });
}
