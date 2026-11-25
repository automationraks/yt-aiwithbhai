import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authenticated() {
  const db = await createSupabaseServerClient();
  if (!db) return { error: NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }) };
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  return { db, user };
}

export async function GET() {
  const auth = await authenticated();
  if (auth.error) return auth.error;
  const { data, error } = await auth.db!.from("automation_schedules").upsert({ owner_id: auth.user!.id, schedule_key: "daily_content_research", schedule_time: "12:00", timezone: "Asia/Kolkata", enabled: true }, { onConflict: "owner_id", ignoreDuplicates: true }).select("schedule_time,timezone,enabled,last_dispatched_on").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load automation schedule. Apply the schedule migration first.", details: error.message }, { status: 500 });
  if (data) return NextResponse.json({ schedule: data });
  const { data: existing, error: readError } = await auth.db!.from("automation_schedules").select("schedule_time,timezone,enabled,last_dispatched_on").eq("owner_id", auth.user!.id).eq("schedule_key", "daily_content_research").single();
  if (readError) return NextResponse.json({ error: "Could not read saved schedule.", details: readError.message }, { status: 500 });
  return NextResponse.json({ schedule: existing });
}

export async function PUT(request: Request) {
  const auth = await authenticated();
  if (auth.error) return auth.error;
  let body: { scheduleTime?: unknown; enabled?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const scheduleTime = String(body.scheduleTime ?? "");
  if (! /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)) return NextResponse.json({ error: "Choose a valid time in 24-hour HH:MM format." }, { status: 400 });
  const enabled = body.enabled === undefined ? true : body.enabled === true;
  const { data, error } = await auth.db!.from("automation_schedules").upsert({
    owner_id: auth.user!.id,
    schedule_key: "daily_content_research",
    schedule_time: scheduleTime,
    timezone: "Asia/Kolkata",
    enabled,
    updated_at: new Date().toISOString()
  }, { onConflict: "owner_id" }).select("schedule_time,timezone,enabled,last_dispatched_on").single();
  if (error) return NextResponse.json({ error: "Could not save schedule. Apply the schedule migration first.", details: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data, message: "Daily content schedule saved." });
}
