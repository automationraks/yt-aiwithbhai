import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/instagram/crypto";

export const runtime = "nodejs";

const version = () => process.env.META_GRAPH_VERSION || "v25.0";

async function graph(path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${version()}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "Meta Graph API request failed.");
  }
  return data;
}

export async function GET(req: NextRequest) {
  const destination = new URL("/instagram", req.url);
  const fail = (message: string) => {
    destination.searchParams.set("error", message.slice(0, 240));
    const response = NextResponse.redirect(destination);
    response.cookies.delete("ig_oauth_state");
    return response;
  };

  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("ig_oauth_state")?.value;
  const code = req.nextUrl.searchParams.get("code");

  if (!state || !cookieState || state !== cookieState) {
    return fail("Instagram authorization state did not match. Please connect again.");
  }
  if (req.nextUrl.searchParams.get("error")) {
    return fail(req.nextUrl.searchParams.get("error_description") || "Instagram authorization was cancelled.");
  }
  if (!code) {
    return fail("Meta did not return an authorization code.");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("Supabase is not configured.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Sign in and connect again.");

  try {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_REDIRECT_URI;
    if (!appId || !appSecret || !redirectUri) {
      throw new Error("Meta OAuth environment variables are not configured.");
    }

    const shortLived = await graph("oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const longLived = await graph("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: String(shortLived.access_token),
    });

    const accessToken = String(longLived.access_token);

    // Persist the permissions Meta actually granted, rather than assuming
    // every permission selected in the login configuration was approved.
    const permissionResult = await graph("me/permissions", { access_token: accessToken });
    const grantedScopes = (permissionResult.data ?? [])
      .filter((permission: { status?: string }) => permission.status === "granted")
      .map((permission: { permission: string }) => permission.permission);

    const pages = await graph("me/accounts", {
      fields: "id,name,access_token,instagram_business_account{id,username}",
      access_token: accessToken,
    });

    const page = (pages.data ?? []).find(
      (candidate: { instagram_business_account?: { id?: string; username?: string } }) =>
        candidate.instagram_business_account?.id && candidate.instagram_business_account?.username,
    );

    if (!page) {
      throw new Error(
        "No linked Instagram Business or Creator account was returned. Confirm that the Facebook user has access to the Page and that the Instagram professional account is linked to it.",
      );
    }

    const instagramAccount = page.instagram_business_account;
    const { error } = await supabase.from("instagram_connections").upsert(
      {
        owner_id: user.id,
        instagram_user_id: instagramAccount.id,
        instagram_username: instagramAccount.username,
        facebook_page_id: page.id,
        facebook_page_name: page.name ?? null,
        encrypted_page_access_token: encryptToken(String(page.access_token)),
        token_expires_at: longLived.expires_in
          ? new Date(Date.now() + Number(longLived.expires_in) * 1000).toISOString()
          : null,
        scopes: grantedScopes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );

    if (error) {
      throw new Error("Could not securely save Instagram connection: " + error.message);
    }

    destination.searchParams.set("connected", "1");
  } catch (error) {
    destination.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Instagram connection failed.",
    );
  }

  const response = NextResponse.redirect(destination);
  response.cookies.delete("ig_oauth_state");
  return response;
}
