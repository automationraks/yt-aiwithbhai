import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // A qualified channel is active only when the user explicitly wants it tracked.
  const { data: qualified, error: qualifiedError } = await supabase.from("competitors")
    .select("id,is_active,user_tracking_preference").eq("owner_id", user.id).eq("ai_production_status", "qualified");
  if (qualifiedError) return NextResponse.json({ error: "Could not load qualified channels.", details: qualifiedError.message }, { status: 500 });

  const { data: unqualifiedChanged, error: inactiveError } = await supabase.from("competitors")
    .update({ is_active: false }).eq("owner_id", user.id).neq("ai_production_status", "qualified").eq("is_active", true).select("id");
  if (inactiveError) return NextResponse.json({ error: "Could not deactivate unqualified channels.", details: inactiveError.message }, { status: 500 });

  let activated = 0, paused = unqualifiedChanged?.length ?? 0;
  for (const row of qualified ?? []) {
    const desired = row.user_tracking_preference === true;
    if (row.is_active === desired) continue;
    const { error } = await supabase.from("competitors").update({ is_active: desired }).eq("id", row.id).eq("owner_id", user.id);
    if (error) return NextResponse.json({ error: "Could not reconcile saved tracking preference.", details: error.message }, { status: 500 });
    if (desired) activated++; else paused++;
  }

  const { data, error } = await supabase.from("competitors")
    .select("id,youtube_channel_id,channel_title,channel_url,description,published_at,country,language,subscriber_count,video_count,view_count,is_active,discovered_at,last_checked_at,ai_production_status,ai_production_evidence,ai_production_reviewed_at,ai_production_review_note,discovery_count,last_discovered_at,discovery_eligibility,discovery_reason,discovery_score,user_tracking_preference,last_user_action,last_user_action_at")
    .eq("owner_id", user.id).order("subscriber_count", { ascending: false, nullsFirst: false }).limit(500);
  if (error) return NextResponse.json({ error: "Tracking was reconciled, but the list could not be loaded.", details: error.message }, { status: 500 });
  return NextResponse.json({ competitors: data ?? [], activated, paused, activeCount: (data ?? []).filter((item) => item.is_active).length });
}
