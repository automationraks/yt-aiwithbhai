import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data, error } = await supabase.from("app_notifications").select("*")
    .eq("owner_id", user.id).order("created_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: "Could not load notifications.", details: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [], unread: (data ?? []).filter(item => !item.read_at).length });
}
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: { id?: unknown; markAllRead?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  let query = supabase.from("app_notifications").update({ read_at: new Date().toISOString() }).eq("owner_id", user.id).is("read_at", null);
  if (body.markAllRead !== true) {
    if (typeof body.id !== "string") return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    query = supabase.from("app_notifications").update({ read_at: new Date().toISOString() }).eq("owner_id", user.id).eq("id", body.id).is("read_at", null);
  }
  const { error } = await query;
  if (error) return NextResponse.json({ error: "Could not update notification.", details: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
