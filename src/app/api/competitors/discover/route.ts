import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const MAX_ACTIVE_COMPETITORS = 100;
const MAX_KEYWORDS = 5;

type QuotaReservation = { allowed: boolean; bucket: string; used: number; limit: number; remaining: number; resetAt: string; quotaDate: string };

async function reserveQuota(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, bucket: "search" | "general") {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("reserve_youtube_quota", { p_bucket: bucket, p_amount: 1 });
  if (error) throw new Error(`Quota tracker unavailable. Run the latest Supabase SQL migration. ${error.message}`);
  return data as QuotaReservation;
}

type YouTubeChannel = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    country?: string;
    customUrl?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
    hiddenSubscriberCount?: boolean;
  };
};

async function youtubeGet<T>(resource: string, params: Record<string, string>) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YouTube Data API key is not configured.");

  const url = new URL(`${YOUTUBE_API}/${resource}`);
  for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason = payload?.error?.errors?.[0]?.reason;
    if (response.status === 403 && reason === "quotaExceeded") {
      throw new Error("YouTube API daily quota is exhausted. Try again after the quota resets.");
    }
    if (response.status === 403) {
      throw new Error("YouTube API access was denied. Check that YouTube Data API v3 is enabled and the key restrictions allow this server request.");
    }
    throw new Error(payload?.error?.message || `YouTube API request failed (${response.status}).`);
  }

  return payload as T;
}

function isWithinChannelAge(publishedAt?: string) {
  if (!publishedAt) return false;
  const created = new Date(publishedAt).getTime();
  if (!Number.isFinite(created)) return false;
  const now = Date.now();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const fourYearsAgo = new Date();
  fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
  return created <= twoYearsAgo.getTime() && created >= fourYearsAgo.getTime() && created <= now;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json({ error: "YOUTUBE_API_KEY is not configured on the server." }, { status: 503 });
  }

  let body: { keywords?: unknown; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const language = body.language === "en" ? "en" : body.language === "hi" ? "hi" : null;
  const keywords = Array.isArray(body.keywords)
    ? [...new Set(body.keywords.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];

  if (!language || keywords.length === 0 || keywords.length > MAX_KEYWORDS || keywords.some((keyword) => keyword.length > 80)) {
    return NextResponse.json({
      error: `Provide language "hi" or "en" and between 1 and ${MAX_KEYWORDS} keywords (maximum 80 characters each).`,
    }, { status: 400 });
  }

  const { count, error: countError } = await supabase
    .from("competitors")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (countError) {
    return NextResponse.json({ error: "Could not check your active competitor limit." }, { status: 500 });
  }

  const remaining = Math.max(0, MAX_ACTIVE_COMPETITORS - (count ?? 0));
  if (remaining === 0) {
    return NextResponse.json({ error: "You already have 100 active competitors. Deactivate one before discovering more.", activeLimit: MAX_ACTIVE_COMPETITORS }, { status: 409 });
  }

  try {
    const channelIds = new Set<string>();\n    const samplesByChannel = new Map<string, Array<{ videoId: string | null; title: string; description: string; channelTitle: string; publishedAt: string | null; thumbnailUrl: string | null; matchedQuery: string; videoUrl: string | null }>>();\n    const samplesByChannel = new Map<string, Array<{ videoId: string | null; title: string; description: string; channelTitle: string; publishedAt: string | null; thumbnailUrl: string | null; matchedQuery: string; videoUrl: string | null }>>();
    for (const keyword of keywords) {
      const reservation = await reserveQuota(supabase, "search");
      if (!reservation.allowed) {
        return NextResponse.json({
          error: "Daily YouTube search request limit reached. Remaining searches are blocked until the quota resets.",
          quota: reservation,
        }, { status: 429 });
      }
      const search = await youtubeGet<{ items?: Array<{ id?: { channelId?: string } }> }>("search", {
        part: "snippet",
        type: "channel",
        maxResults: "25",
        q: keyword,
        relevanceLanguage: language,
      });
      for (const item of search.items ?? []) {
        if (item.id?.channelId) channelIds.add(item.id.channelId);
      }
    }

    const ids = [...channelIds];
    const channels: YouTubeChannel[] = [];
    for (let index = 0; index < ids.length; index += 50) {
      const batch = ids.slice(index, index + 50);
      const reservation = await reserveQuota(supabase, "general");
      if (!reservation.allowed) {
        return NextResponse.json({
          error: "Daily YouTube general API quota limit reached. Channel details were not requested.",
          quota: reservation,
        }, { status: 429 });
      }
      const result = await youtubeGet<{ items?: YouTubeChannel[] }>("channels", {
        part: "snippet,statistics,contentDetails",
        id: batch.join(","),
        maxResults: "50",
      });
      channels.push(...(result.items ?? []));
    }

    const eligible = channels
      .filter((channel) => channel.id && channel.snippet?.title && isWithinChannelAge(channel.snippet.publishedAt))
      .sort((a, b) => Number(b.statistics?.subscriberCount ?? 0) - Number(a.statistics?.subscriberCount ?? 0));

    const rows = eligible.slice(0, remaining).map((channel) => ({
      owner_id: user.id,
      youtube_channel_id: channel.id,
      channel_title: channel.snippet?.title ?? "Untitled channel",
      channel_url: channel.snippet?.customUrl
        ? `https://www.youtube.com/@${channel.snippet.customUrl.replace(/^@/, "")}`
        : `https://www.youtube.com/channel/${channel.id}`,
      description: channel.snippet?.description ?? null,
      published_at: channel.snippet?.publishedAt ?? null,
      country: channel.snippet?.country ?? null,
      language,
      subscriber_count: channel.statistics?.subscriberCount ?? null,
      video_count: channel.statistics?.videoCount ?? null,
      view_count: channel.statistics?.viewCount ?? null,
      is_active: true,
      last_checked_at: new Date().toISOString(),
    }));

    let saved = 0;
    if (rows.length > 0) {
      const { data, error } = await supabase
        .from("competitors")
        .upsert(rows, { onConflict: "owner_id,youtube_channel_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        return NextResponse.json({ error: "YouTube search succeeded, but saving competitors failed.", details: error.message }, { status: 500 });
      }
      saved = data?.length ?? 0;
    }

    return NextResponse.json({
      searchedKeywords: keywords,
      language,
      channelsDiscovered: channelIds.size,
      channelsWithinAgeRange: eligible.length,
      saved,
      activeCompetitorCount: (count ?? 0) + saved,
      activeCompetitorLimit: MAX_ACTIVE_COMPETITORS,
      ageFilter: "Channels created between 2 and 4 years ago",\n      qualification: "Candidates only. AI voiceover and AI-generated visuals are not verified by YouTube public metadata; review sample videos before marking qualified.",
      quotaNote: "This dashboard tracks requests made through this app only. Other apps using the same Google Cloud project also consume its quota.",
      quota: await (async () => {
        const { data } = await supabase.rpc("get_youtube_quota_status");
        return data ?? null;
      })(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected YouTube discovery error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
