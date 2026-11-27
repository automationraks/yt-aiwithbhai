import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE, getActiveWorkspace } from "@/lib/workspaces/context";
export const dynamic = "force-dynamic";

export async function GET() {
 const db = await createSupabaseServerClient();
 if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
 const { data: { user } } = await db.auth.getUser();
 if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 const active = await getActiveWorkspace(db, user.id);
 const { data, error } = await db.from("channel_workspaces")
  .select("id,name,slug,timezone,is_default").eq("owner_id", user.id).eq("is_active", true).order("created_at");
 if (error) return NextResponse.json({ error: "Could not load workspaces.", details: error.message }, { status: 500 });
 return NextResponse.json({ activeWorkspace: active, workspaces: data ?? [] });
}

export async function PUT(request: Request) {
 const db = await createSupabaseServerClient();
 if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
 const { data: { user } } = await db.auth.getUser();
 if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 let body: { workspaceId?: unknown };
 try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
 if (typeof body.workspaceId !== "string") return NextResponse.json({ error: "workspaceId is required." }, { status: 400 });
 const { data, error } = await db.from("channel_workspaces")
  .select("id,name,slug,timezone,is_default").eq("id", body.workspaceId)
  .eq("owner_id", user.id).eq("is_active", true).maybeSingle();
 if (error || !data) return NextResponse.json({ error: "Workspace not found or unavailable." }, { status: 404 });
 const response = NextResponse.json({ ok: true, activeWorkspace: data });
 response.cookies.set(ACTIVE_WORKSPACE_COOKIE, data.id, {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
  path: "/", maxAge: 60 * 60 * 24 * 30
 });
 return response;
}
