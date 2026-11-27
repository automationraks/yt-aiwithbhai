import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/context";
export const dynamic = "force-dynamic";
export async function GET() {
 const db = await createSupabaseServerClient();
 if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
 const { data: { user } } = await db.auth.getUser();
 if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 const ws = await getActiveWorkspace(db, user.id);
 if (!ws) return NextResponse.json({ connections: [], readiness: {} });
 const { data: accounts, error } = await db.from("channel_accounts")
  .select("id,platform,account_name,handle,connection_status,last_verified_at,profile_url")
  .eq("owner_id", user.id).eq("workspace_id", ws.id).order("platform");
 if (error) return NextResponse.json({ error: "Could not load registered accounts.", details: error.message }, { status: 500 });
 const {data:youtube}=await db.from("youtube_connections").select("channel_id,channel_title,channel_handle,connection_status,last_verified_at").eq("owner_id",user.id).eq("workspace_id",ws.id).maybeSingle();
 const {data:instagram}=await db.from("instagram_connections").select("instagram_user_id,instagram_username,connection_status:instagram_user_id,connected_at").eq("owner_id",user.id).eq("workspace_id",ws.id).maybeSingle();
 const webhookConfigured = Boolean(process.env.N8N_PUBLISHING_WEBHOOK_URL);
 const callbackConfigured = Boolean(process.env.N8N_PUBLISHING_CALLBACK_SECRET);
 return NextResponse.json({
  activeWorkspace: ws, connections: accounts ?? [],
  readiness: {
   n8nWebhook: webhookConfigured, callbackSecret: callbackConfigured,
   youtubeOAuth: youtube?.connection_status === "connected",
   youtubeChannel: youtube ?? null,
   instagramOAuth: Boolean(instagram?.instagram_user_id),
   instagramAccount: instagram ?? null,
   canDispatch: webhookConfigured && callbackConfigured,
   note: "OAuth credentials are stored encrypted per workspace. YouTube and Instagram publishing workflows must still be configured and tested in n8n."
  }
 });
}
