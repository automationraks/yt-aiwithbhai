import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("youtube_research_queue_history")
    .select("id, competitor_id, youtube_channel_id, channel_title, channel_url, video_id, video_title, video_url, thumbnail_url, selected_at")
    .eq("owner_id", user.id)
    .order("selected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Could not load Channel Preparation selection. Apply the Channel Preparation SQL migration in Supabase first.", details: error.message },
      { status: 503 },
    );
  }

  const { count, error: countError } = await supabase
    .from("competitors")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .eq("ai_production_status", "qualified");

  if (countError) {
    return NextResponse.json({ error: "Could not count shortlisted channels.", details: countError.message }, { status: 503 });
  }

  const now = new Date();
  const nextRefresh = new Date(now);
  nextRefresh.setSeconds(0, 0);
  nextRefresh.setMinutes(Math.ceil((now.getMinutes() + 1) / 10) * 10);
  const nextRefreshAt = nextRefresh.toISOString();

  return NextResponse.json({
    mode: "cloud",
    intervalMinutes: 10,
    activeShortlistedChannels: count ?? 0,
    selection: data ?? null,
    nextRefreshAt,
    message: data
      ? "A random shortlisted sample video is selected by the cloud scheduler every 10 minutes."
      : "No video has been selected yet. The first cloud rotation runs at the next 10-minute schedule tick.",
  });
}
