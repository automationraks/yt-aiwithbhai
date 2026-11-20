import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data, error } = await supabase.from("competitors")
    .select("id,youtube_channel_id,channel_title,channel_url,description,published_at,country,language,subscriber_count,video_count,view_count,is_active,discovered_at,last_checked_at,ai_production_status,ai_production_evidence,ai_production_reviewed_at,ai_production_review_note,discovery_count,last_discovered_at,discovery_eligibility,discovery_reason,discovery_score,user_tracking_preference,last_user_action,last_user_action_at")
    .eq("owner_id", user.id).order("subscriber_count", { ascending: false, nullsFirst: false }).limit(500);
  if (error) return NextResponse.json({ error: "Unable to load competitors.", details: error.message }, { status: 500 });
  const { count, error: countError } = await supabase.from("competitors").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified");
  if (countError) return NextResponse.json({ error: "Unable to count active competitors.", details: countError.message }, { status: 500 });
  return NextResponse.json({ competitors: data ?? [], activeCount: count ?? 0, limit: 100 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { id?: unknown; is_active?: unknown; ai_production_status?: unknown; ai_production_review_note?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "A competitor id is required." }, { status: 400 });
  }

  if (typeof body.ai_production_status === "string") {
    if (!["qualified", "rejected", "needs_review"].includes(body.ai_production_status)) {
      return NextResponse.json({ error: "Invalid AI-production review status." }, { status: 400 });
    }
    const { data: current, error: currentError } = await supabase.from("competitors")
      .select("is_active,ai_production_status").eq("id", body.id).eq("owner_id", user.id).maybeSingle();
    if (currentError || !current) return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
    if (body.ai_production_status === "qualified" && !current.is_active) {
      const { count, error: countError } = await supabase.from("competitors")
        .select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_active", true);
      if (countError) return NextResponse.json({ error: "Could not verify active competitor limit." }, { status: 500 });
      if ((count ?? 0) >= 100) return NextResponse.json({ error: "100 active competitor slots are already in use. Pause one before qualifying another channel." }, { status: 409 });
    }
    const note = typeof body.ai_production_review_note === "string" ? body.ai_production_review_note.slice(0, 1000) : null;
    const actionAt = new Date().toISOString();
    const action = body.ai_production_status === "qualified" ? "qualified" : body.ai_production_status === "rejected" ? "rejected" : "reset_to_review";
    const shouldTrack = body.ai_production_status === "qualified";
    const { data, error } = await supabase.from("competitors").update({
      ai_production_status: body.ai_production_status,
      ai_production_reviewed_at: actionAt,
      ai_production_review_note: note,
      user_tracking_preference: shouldTrack,
      last_user_action: action,
      last_user_action_at: actionAt,
      is_active: shouldTrack,
    }).eq("id", body.id).eq("owner_id", user.id).select("id,is_active,ai_production_status,ai_production_reviewed_at,ai_production_review_note,user_tracking_preference,last_user_action,last_user_action_at").maybeSingle();
    if (error) return NextResponse.json({ error: "Could not save AI-production review.", details: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
    const { error: logError } = await supabase.from("competitor_action_log").insert({ owner_id: user.id, competitor_id: data.id, action, details: { note, is_active: data.is_active } });
    if (logError) return NextResponse.json({ error: "Review saved, but action history could not be recorded.", details: logError.message }, { status: 500 });
    return NextResponse.json({ competitor: data });
  }

  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "Provide is_active or an AI-production review status." }, { status: 400 });
  }

  if (body.is_active) {
    const { data: current, error: currentError } = await supabase.from("competitors").select("is_active,ai_production_status").eq("id", body.id).eq("owner_id", user.id).maybeSingle();
    if (currentError || !current) return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
    if (current.ai_production_status !== "qualified") return NextResponse.json({ error: "Approve this channel first. Only approved channels can be activated." }, { status: 409 });
    const { count, error: countError } = await supabase.from("competitors").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified");
    if (countError) return NextResponse.json({ error: "Could not verify active competitor limit." }, { status: 500 });
    if (!current.is_active && (count ?? 0) >= 100) return NextResponse.json({ error: "You have reached the 100 active competitor limit." }, { status: 409 });
  }

  const actionAt = new Date().toISOString();
  const action = body.is_active ? "tracking_resumed" : "tracking_paused";
  const { data, error } = await supabase.from("competitors").update({
    is_active: body.is_active, user_tracking_preference: body.is_active,
    last_user_action: action, last_user_action_at: actionAt,
  }).eq("id", body.id).eq("owner_id", user.id).select("id,is_active,user_tracking_preference,last_user_action,last_user_action_at").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update competitor.", details: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  const { error: logError } = await supabase.from("competitor_action_log").insert({ owner_id: user.id, competitor_id: data.id, action, details: { is_active: data.is_active } });
  if (logError) return NextResponse.json({ error: "Tracking updated, but action history could not be saved.", details: logError.message }, { status: 500 });
  return NextResponse.json({ competitor: data });
}
