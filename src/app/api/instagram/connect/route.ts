import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/context";

export const runtime = "nodejs";

const graphVersion = () => process.env.META_GRAPH_VERSION || "v25.0";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const workspace = await getActiveWorkspace(supabase, user.id);
  if (!workspace) return NextResponse.json({ error: "Create a workspace first." }, { status: 409 });

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  const configId = process.env.META_LOGIN_CONFIG_ID || "1737762211255032";

  if (!appId || !appSecret || !redirectUri || !configId) {
    return NextResponse.json(
      { error: "Configure META_APP_ID, META_APP_SECRET, META_REDIRECT_URI and META_LOGIN_CONFIG_ID." },
      { status: 503 },
    );
  }

  const state = randomBytes(24).toString("hex");
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  // Facebook Login for Business configuration defines the permissions.
  // Do not send a separate scope parameter with config_id.
  url.searchParams.set("config_id", configId);

  const response = NextResponse.redirect(url);
  response.cookies.set("ig_oauth_workspace", workspace.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/instagram/callback", maxAge: 600 });
  response.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/instagram/callback",
    maxAge: 600,
  });
  return response;
}
