import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Alert = {
  id: string;
  competitorId: string;
  channel: string;
  type: "subscriber_growth" | "subscriber_decline" | "view_growth" | "upload_gap" | "top_video";
  severity: "info" | "warning" | "positive";
  title: string;
  detail: string;
  detectedAt: string;
};

export async function GET() {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: channels, error } = await db.from("competitors")
    .select("id,channel_title,subscriber_count,view_count,last_checked_at")
    .eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified");
  if (error) return NextResponse.json({ error: "Could not load tracked channels.", details: error.message }, { status: 500 });
  const ids = (channels ?? []).map((channel) => channel.id);
  if (!ids.length) return NextResponse.json({ alerts: [], generatedAt: new Date().toISOString() });

  const [historyResult, videosResult] = await Promise.all([
    db.from("competitor_snapshots").select("competitor_id,subscriber_count,view_count,captured_at")
      .in("competitor_id", ids).order("captured_at", { ascending: false }),
    db.from("videos").select("competitor_id,title,view_count,published_at")
      .in("competitor_id", ids).eq("is_niche_relevant", true).order("published_at", { ascending: false }),
  ]);
  if (historyResult.error || videosResult.error) return NextResponse.json({
    error: "Could not load competitor history.",
    details: historyResult.error?.message ?? videosResult.error?.message,
  }, { status: 500 });

  const history = new Map<string, typeof historyResult.data>();
  for (const row of historyResult.data ?? []) history.set(row.competitor_id, [...(history.get(row.competitor_id) ?? []), row]);
  const videos = new Map<string, typeof videosResult.data>();
  for (const row of videosResult.data ?? []) if (row.competitor_id) videos.set(row.competitor_id, [...(videos.get(row.competitor_id) ?? []), row]);

  const now = Date.now();
  const alerts: Alert[] = [];
  for (const channel of channels ?? []) {
    const name = channel.channel_title || "Tracked channel";
    const snapshots = history.get(channel.id) ?? [];
    const latest = snapshots[0];
    const baseline = snapshots.find((row) => latest && new Date(latest.captured_at).getTime() - new Date(row.captured_at).getTime() >= 6 * 86400000);
    if (latest && baseline) {
      const oldSubs = Number(baseline.subscriber_count ?? 0);
      const newSubs = Number(latest.subscriber_count ?? 0);
      const oldViews = Number(baseline.view_count ?? 0);
      const newViews = Number(latest.view_count ?? 0);
      if (oldSubs > 0) {
        const change = (newSubs - oldSubs) / oldSubs * 100;
        if (change >= 5) alerts.push({ id: channel.id + ":subs-up", competitorId: channel.id, channel: name, type: "subscriber_growth", severity: "positive", title: "Subscriber growth detected", detail: `+${change.toFixed(1)}% over the snapshot comparison period (${newSubs.toLocaleString("en-IN")} vs ${oldSubs.toLocaleString("en-IN")}).`, detectedAt: latest.captured_at });
        if (change <= -5) alerts.push({ id: channel.id + ":subs-down", competitorId: channel.id, channel: name, type: "subscriber_decline", severity: "warning", title: "Subscriber decline detected", detail: `${change.toFixed(1)}% over the snapshot comparison period.`, detectedAt: latest.captured_at });
      }
      if (oldViews > 0) {
        const change = (newViews - oldViews) / oldViews * 100;
        if (change >= 10) alerts.push({ id: channel.id + ":views-up", competitorId: channel.id, channel: name, type: "view_growth", severity: "positive", title: "Channel views accelerated", detail: `Total public channel views increased ${change.toFixed(1)}% between snapshots.`, detectedAt: latest.captured_at });
      }
    }
    const channelVideos = videos.get(channel.id) ?? [];
    const newest = channelVideos.find((video) => video.published_at);
    if (newest?.published_at) {
      const ageDays = (now - new Date(newest.published_at).getTime()) / 86400000;
      if (ageDays >= 21) alerts.push({ id: channel.id + ":upload-gap", competitorId: channel.id, channel: name, type: "upload_gap", severity: "warning", title: "No recent niche-matched upload", detail: `Latest saved niche-matched upload is ${Math.floor(ageDays)} days old.`, detectedAt: newest.published_at });
    }
    const viewSamples = channelVideos.map((video) => Number(video.view_count ?? 0)).filter((value) => value > 0);
    if (viewSamples.length >= 3) {
      const average = viewSamples.reduce((sum, value) => sum + value, 0) / viewSamples.length;
      const standout = channelVideos.find((video) => Number(video.view_count ?? 0) >= Math.max(1000, average * 3));
      if (standout) alerts.push({ id: channel.id + ":top-video:" + standout.title, competitorId: channel.id, channel: name, type: "top_video", severity: "info", title: "Standout niche video", detail: `“${(standout.title ?? "Untitled").slice(0, 120)}” has ${Number(standout.view_count ?? 0).toLocaleString("en-IN")} views, at least 3× the sampled average.`, detectedAt: standout.published_at ?? new Date().toISOString() });
    }
  }
  alerts.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  return NextResponse.json({
    alerts: alerts.slice(0, 50),
    generatedAt: new Date().toISOString(),
    methodology: "Alerts are rule-based signals from saved public snapshots and niche-matched upload samples. They are not real-time notifications or YouTube Analytics. Growth comparisons require snapshots at least six days apart; upload-gap and standout-video signals depend on the saved sample.",
  });
}
