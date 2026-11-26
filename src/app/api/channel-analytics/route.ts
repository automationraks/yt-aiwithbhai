import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/instagram/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type YouTubeVideo = { id: string; title: string; publishedAt: string; thumbnail: string | null; views: number; likes: number; comments: number; url: string };
type InstagramMedia = { id: string; caption: string; media_type: string; permalink: string; timestamp: string; like_count?: number; comments_count?: number; view_count?: number };

async function getYouTube() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { connected: false, error: "YOUTUBE_API_KEY is not configured." };
  const base = "https://www.googleapis.com/youtube/v3/";
  const channelUrl = new URL(base + "channels");
  channelUrl.search = new URLSearchParams({ part: "snippet,statistics,contentDetails", forHandle: "AiWithBhai-ytb", key }).toString();
  const channelResponse = await fetch(channelUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const channelData = await channelResponse.json();
  if (!channelResponse.ok) throw new Error(channelData.error?.message || "YouTube channel lookup failed.");
  const channel = channelData.items?.[0];
  if (!channel) return { connected: false, error: "YouTube channel @AiWithBhai-ytb was not found. Check the configured handle." };
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  let recentVideos: YouTubeVideo[] = [];
  if (uploads) {
    const playlistUrl = new URL(base + "playlistItems");
    playlistUrl.search = new URLSearchParams({ part: "snippet,contentDetails", playlistId: uploads, maxResults: "10", key }).toString();
    const playlistResponse = await fetch(playlistUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const playlistData = await playlistResponse.json();
    if (!playlistResponse.ok) throw new Error(playlistData.error?.message || "Could not load YouTube uploads.");
    const ids = (playlistData.items ?? []).map((item: { contentDetails?: { videoId?: string } }) => item.contentDetails?.videoId).filter(Boolean);
    if (ids.length) {
      const videosUrl = new URL(base + "videos");
      videosUrl.search = new URLSearchParams({ part: "snippet,statistics", id: ids.join(","), key }).toString();
      const videosResponse = await fetch(videosUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const videosData = await videosResponse.json();
      if (!videosResponse.ok) throw new Error(videosData.error?.message || "Could not load YouTube video statistics.");
      recentVideos = (videosData.items ?? []).map((v: { id: string; snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } } }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }) => ({
        id: v.id, title: v.snippet?.title ?? "Untitled video", publishedAt: v.snippet?.publishedAt ?? "",
        thumbnail: v.snippet?.thumbnails?.medium?.url ?? null, views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0), comments: Number(v.statistics?.commentCount ?? 0),
        url: "https://www.youtube.com/watch?v=" + v.id
      }));
    }
  }
  const s = channel.statistics ?? {};
  return { connected: true, channel: { id: channel.id, title: channel.snippet?.title ?? "YouTube channel", url: "https://www.youtube.com/channel/" + channel.id, subscribers: Number(s.subscriberCount ?? 0), totalViews: Number(s.viewCount ?? 0), videos: Number(s.videoCount ?? 0), hiddenSubscribers: s.hiddenSubscriberCount === true }, recentVideos };
}

async function getInstagram(db: Awaited<ReturnType<typeof createSupabaseServerClient>>, ownerId: string) {
  if (!db) return { connected: false, error: "Supabase is not configured." };
  const { data, error } = await db.from("instagram_connections").select("instagram_username,instagram_user_id,encrypted_page_access_token,token_expires_at").eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error("Could not read Instagram connection: " + error.message);
  if (!data?.instagram_user_id || !data.encrypted_page_access_token) return { connected: false, error: "Connect Instagram in Instagram Discovery to load account analytics." };
  if (data.token_expires_at && new Date(data.token_expires_at).getTime() < Date.now()) return { connected: false, error: "Instagram access token has expired. Reconnect the account." };
  const token = decryptToken(data.encrypted_page_access_token);
  const version = process.env.META_GRAPH_VERSION || "v25.0";
  const url = new URL("https://graph.facebook.com/" + version + "/" + data.instagram_user_id);
  url.searchParams.set("fields", "username,followers_count,follows_count,media_count,media.limit(10){id,caption,media_type,permalink,timestamp,like_count,comments_count,views}");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Instagram Graph API analytics request failed.");
  const media = (result.media?.data ?? []) as InstagramMedia[];
  return { connected: true, account: { username: result.username ?? data.instagram_username, followers: Number(result.followers_count ?? 0), following: Number(result.follows_count ?? 0), mediaCount: Number(result.media_count ?? 0), profileUrl: "https://www.instagram.com/" + (result.username ?? data.instagram_username) + "/" }, recentMedia: media.map(item => ({ id: item.id, caption: item.caption ?? "", type: item.media_type, url: item.permalink, publishedAt: item.timestamp, likes: Number(item.like_count ?? 0), comments: Number(item.comments_count ?? 0), views: Number(item.view_count ?? 0) })) };
}

export async function GET() {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const results = await Promise.allSettled([getYouTube(), getInstagram(db, user.id)]);
  const youtube = results[0].status === "fulfilled" ? results[0].value : { connected: false, error: results[0].reason instanceof Error ? results[0].reason.message : "YouTube analytics unavailable." };
  const instagram = results[1].status === "fulfilled" ? results[1].value : { connected: false, error: results[1].reason instanceof Error ? results[1].reason.message : "Instagram analytics unavailable." };
  return NextResponse.json({ youtube, instagram, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
