import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const BATCH_SIZE = 10;
const SAMPLE_SIZE = 5;

type VideoItem = {
  id: string;
  snippet?: { title?: string; description?: string; publishedAt?: string; channelId?: string; defaultLanguage?: string; thumbnails?: { medium?: { url?: string }; high?: { url?: string } } };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

async function reserveQuota(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>) {
  const { data, error } = await supabase.rpc("reserve_youtube_quota", { p_bucket: "general", p_amount: 1 });
  if (error) throw new Error(`YouTube quota tracker unavailable. Apply the quota migration. ${error.message}`);
  if (!data?.allowed) throw new Error("Daily YouTube general API quota limit reached.");
}

async function youtubeGet<T>(resource: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured.");
  const url = new URL(`${YOUTUBE_API}/${resource}`);
  Object.entries({ ...params, key }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `YouTube API request failed (${response.status}).`);
  return data as T;
}

function durationSeconds(value?: string) {
  if (!value) return 0;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!process.env.YOUTUBE_API_KEY) return NextResponse.json({ error: "YOUTUBE_API_KEY is not configured." }, { status: 503 });

  const { data: competitors, error } = await supabase.from("competitors")
    .select("id,youtube_channel_id,channel_title")
    .eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified")
    .order("last_checked_at", { ascending: true, nullsFirst: true }).limit(BATCH_SIZE);
  if (error) return NextResponse.json({ error: "Could not load qualified competitors.", details: error.message }, { status: 500 });
  if (!competitors?.length) return NextResponse.json({ processed: 0, message: "No active, qualified competitors are waiting for refresh." });

  try {
    await reserveQuota(supabase);
    const channelResult = await youtubeGet<{ items?: Array<{ id: string; statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>("channels", {
      part: "statistics,contentDetails", id: competitors.map((item) => item.youtube_channel_id).join(","), maxResults: String(BATCH_SIZE),
    });
    const channelMap = new Map((channelResult.items ?? []).map((item) => [item.id, item]));
    const samples: Array<{ channel: typeof competitors[number]; videoId: string } > = [];

    for (const competitor of competitors) {
      const uploads = channelMap.get(competitor.youtube_channel_id)?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) continue;
      await reserveQuota(supabase);
      const playlist = await youtubeGet<{ items?: Array<{ contentDetails?: { videoId?: string } }> }>("playlistItems", {
        part: "contentDetails", playlistId: uploads, maxResults: String(SAMPLE_SIZE),
      });
      for (const item of playlist.items ?? []) {
        const videoId = item.contentDetails?.videoId;
        if (videoId) samples.push({ channel: competitor, videoId });
      }
    }

    const videoIds = [...new Set(samples.map((item) => item.videoId))];
    const videos: VideoItem[] = [];
    for (let index = 0; index < videoIds.length; index += 50) {
      await reserveQuota(supabase);
      const result = await youtubeGet<{ items?: VideoItem[] }>("videos", {
        part: "snippet,contentDetails,statistics", id: videoIds.slice(index, index + 50).join(","), maxResults: "50",
      });
      videos.push(...(result.items ?? []));
    }

    const videoRows = videos.map((video) => ({
      owner_id: user.id,
      competitor_id: competitors.find((item) => item.youtube_channel_id === video.snippet?.channelId)?.id ?? null,
      youtube_video_id: video.id,
      title: video.snippet?.title ?? "Untitled video",
      description: (video.snippet?.description ?? "").slice(0, 5000),
      published_at: video.snippet?.publishedAt ?? null,
      duration_seconds: durationSeconds(video.contentDetails?.duration),
      view_count: video.statistics?.viewCount ?? null,
      like_count: video.statistics?.likeCount ?? null,
      comment_count: video.statistics?.commentCount ?? null,
      is_short: durationSeconds(video.contentDetails?.duration) <= 180,
      thumbnail_url: video.snippet?.thumbnails?.high?.url ?? video.snippet?.thumbnails?.medium?.url ?? null,
      video_url: `https://www.youtube.com/watch?v=${video.id}`,
      language: video.snippet?.defaultLanguage ?? null,
    }));

    let savedVideos: Array<{ id: string; youtube_video_id: string }> = [];
    if (videoRows.length) {
      const { data, error: saveError } = await supabase.from("videos")
        .upsert(videoRows, { onConflict: "owner_id,youtube_video_id" })
        .select("id,youtube_video_id");
      if (saveError) throw new Error(`Saving video records failed: ${saveError.message}`);
      savedVideos = data ?? [];
    }

    const snapshots = savedVideos.map((saved) => {
      const source = videos.find((video) => video.id === saved.youtube_video_id);
      return {
        video_id: saved.id,
        view_count: Number(source?.statistics?.viewCount ?? 0),
        like_count: source?.statistics?.likeCount ? Number(source.statistics.likeCount) : null,
        comment_count: source?.statistics?.commentCount ? Number(source.statistics.commentCount) : null,
      };
    });
    if (snapshots.length) {
      const { error: snapshotError } = await supabase.from("video_snapshots").insert(snapshots);
      if (snapshotError) throw new Error(`Saving video history failed: ${snapshotError.message}`);
    }

    const channelSnapshots = competitors.flatMap((competitor) => {
      const channel = channelMap.get(competitor.youtube_channel_id);
      return channel ? [{
        competitor_id: competitor.id,
        subscriber_count: Number(channel.statistics?.subscriberCount ?? 0),
        video_count: Number(channel.statistics?.videoCount ?? 0),
        view_count: Number(channel.statistics?.viewCount ?? 0),
      }] : [];
    });
    if (channelSnapshots.length) {
      const { error: snapshotError } = await supabase.from("competitor_snapshots").insert(channelSnapshots);
      if (snapshotError) throw new Error(`Saving competitor history failed: ${snapshotError.message}`);
    }

    const now = new Date().toISOString();
    const updates = await Promise.all(competitors.map(async (competitor) => {
      const stats = channelMap.get(competitor.youtube_channel_id)?.statistics;
      if (!stats) return null;
      const { error: updateError } = await supabase.from("competitors").update({
        subscriber_count: stats.subscriberCount ?? null,
        video_count: stats.videoCount ?? null,
        view_count: stats.viewCount ?? null,
        last_checked_at: now,
      }).eq("id", competitor.id).eq("owner_id", user.id);
      if (updateError) throw new Error(`Updating ${competitor.channel_title} failed: ${updateError.message}`);
      return competitor.id;
    }));

    return NextResponse.json({
      processed: updates.filter(Boolean).length,
      videosFetched: videos.length,
      videoSnapshotsSaved: snapshots.length,
      competitorSnapshotsSaved: channelSnapshots.length,
      batchSize: BATCH_SIZE,
      remainingActiveCompetitors: Math.max(0, ((await supabase.from("competitors").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified")).count ?? 0) - updates.filter(Boolean).length),
      message: "Competitor statistics, latest uploads and historical snapshots have been refreshed.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Competitor intelligence refresh failed.";
    return NextResponse.json({ error: message }, { status: message.includes("quota") ? 429 : 502 });
  }
}
