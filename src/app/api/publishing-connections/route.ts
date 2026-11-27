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
 const webhookConfigured = Boolean(process.env.N8N_PUBLISHING_WEBHOOK_URL);
 const callbackConfigured = Boolean(process.env.N8N_WEBHOOK_SECRET);
 return NextResponse.json({
  activeWorkspace: ws, connections: accounts ?? [],
  readiness: {
   n8nWebhook: webhookConfigured, callbackSecret: callbackConfigured,
   youtubeOAuth: (accounts ?? []).some(x => x.platform === "youtube" && x.connection_status === "connected"),
   instagramOAuth: (accounts ?? []).some(x => x.platform === "instagram" && x.connection_status === "connected"),
   canDispatch: webhookConfigured && callbackConfigured,
   note: "A registered account is not an OAuth connection. Platform OAuth and token refresh must be completed in the configured publishing provider."
  }
 });
}
