import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const MAX_ACTIVE_COMPETITORS = 100;

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

    const eligible = channels
      .filter((channel) => channel.id && channel.snippet?.title)
      .sort((a, b) => Number(b.statistics?.subscriberCount ?? 0) - Number(a.statistics?.subscriberCount ?? 0));

    const rows = eligible.slice(0, remaining).map((channel) => ({
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
        reviewStatus: "unverified",
        explanation: "Found through video-level searches targeting faceless/AI-style industrial production. This is a candidate signal, not proof of AI voiceover or AI-generated visuals.",
        sampleVideos: samplesByChannel.get(channel.id) ?? [],
        requiresHumanVerification: true,
      },
      last_checked_at: new Date().toISOString(),
    }));

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
      channelsWithinAgeRange: eligible.length, saved, candidatesSaved: saved, sampleEvidenceRefreshed: eligible.slice(0, remaining).filter((channel) => (samplesByChannel.get(channel.id)?.length ?? 0) > 0).length, activeCompetitorCount: count ?? 0,
      activeCompetitorLimit: MAX_ACTIVE_COMPETITORS, ageFilter: "No channel-age restriction; global discovery.",
      qualification: "Candidates only. Public YouTube metadata cannot verify AI voiceovers or AI-generated visuals. Review the sample videos before marking a channel as AI-produced.",
      quotaNote: "This dashboard tracks requests made through this app only. Other apps using the same Google Cloud project also consume its quota.",
      quota: quota ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected YouTube discovery error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
