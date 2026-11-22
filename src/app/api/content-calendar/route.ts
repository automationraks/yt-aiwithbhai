import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await createSupabaseServerClient();
  if (!s) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user }, error: authError } = await s.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Query each table separately. This avoids relying on PostgREST embedded
  // relationship resolution and makes the failing table explicit in errors.
  const { data: calendar, error: calendarError } = await s
    .from("content_calendar")
    .select("*")
    .eq("owner_id", user.id)
    .order("scheduled_date", { ascending: true });

  if (calendarError) {
    return NextResponse.json({
      error: "Could not load content_calendar.",
      details: calendarError.message,
      code: calendarError.code,
      hint: calendarError.hint
    }, { status: 500 });
  }

  const ids = (calendar ?? []).map((item) => item.id);
  if (ids.length === 0) return NextResponse.json({ items: [] });

  const [briefsResult, scriptsResult] = await Promise.all([
    s.from("content_research_briefs").select("*").eq("owner_id", user.id).in("calendar_id", ids).order("created_at", { ascending: false }),
    s.from("content_scripts").select("*").eq("owner_id", user.id).in("calendar_id", ids).order("version", { ascending: false })
  ]);

  if (briefsResult.error) {
    return NextResponse.json({
      error: "Could not load content_research_briefs.",
      details: briefsResult.error.message,
      code: briefsResult.error.code,
      hint: briefsResult.error.hint
    }, { status: 500 });
  }
  if (scriptsResult.error) {
    return NextResponse.json({
      error: "Could not load content_scripts.",
      details: scriptsResult.error.message,
      code: scriptsResult.error.code,
      hint: scriptsResult.error.hint
    }, { status: 500 });
  }

  const items = (calendar ?? []).map((item) => ({
    ...item,
    content_research_briefs: (briefsResult.data ?? []).filter((brief) => brief.calendar_id === item.id),
    content_scripts: (scriptsResult.data ?? []).filter((script) => script.calendar_id === item.id)
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const s = await createSupabaseServerClient();
  if (!s) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user }, error: authError } = await s.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let bodyInput: unknown;
  try {
    bodyInput = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const body = typeof bodyInput === "object" && bodyInput !== null && !Array.isArray(bodyInput)
    ? bodyInput as Record<string, unknown>
    : {};
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "A video topic is required." }, { status: 400 });

  const { data, error } = await s.from("content_calendar").insert({
    owner_id: user.id,
    title,
    opportunity_id: typeof body.opportunity_id === "string" ? body.opportunity_id : null,
    scheduled_date: typeof body.scheduled_date === "string" ? body.scheduled_date || null : null,
    format: "short",
    target_duration_seconds: 55
  }).select("*").single();

  if (error) {
    return NextResponse.json({
      error: "Could not create calendar item.",
      details: error.message,
      code: error.code,
      hint: error.hint
    }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}
