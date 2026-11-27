import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET() {
 const db = await createSupabaseServerClient();
 if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
 const { data: { user } } = await db.auth.getUser();
 if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 const { data, error } = await db.from("channel_workspaces").select("id,name,slug,timezone,is_default,is_active")
  .eq("owner_id", user.id).order("created_at", { ascending: true });
 if (error) return NextResponse.json({ error: "Could not load workspaces.", details: error.message }, { status: 500 });
 return NextResponse.json({ workspaces: data ?? [] });
}
