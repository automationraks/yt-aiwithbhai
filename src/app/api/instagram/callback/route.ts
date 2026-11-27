import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/instagram/crypto";

export const runtime = "nodejs";

const version = () => process.env.META_GRAPH_VERSION || "v25.0";


async function graph(path: string, params: Record<string, string>) {
  const endpoint = `https://graph.facebook.com/${version()}/${path}`;
  const url = new URL(endpoint);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    const err = error as Error & {
      cause?: {
        code?: string;
        syscall?: string;
        hostname?: string;
      };
    };

    console.error("[Instagram Graph API Network Failure]", {
      endpoint,
      errorName: err.name,
      message: err.message,
      cause: err.cause
        ? {
            code: err.cause.code,
            syscall: err.cause.syscall,
            hostname: err.cause.hostname,
          }
        : undefined,
    });

    throw new Error(
      `Meta API network request failed at ${path}. ${
        err.cause?.code || err.name || "Unknown network error"
      }`
    );
  }

  type MetaGraphResponse = {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    data?: Array<{
      permission?: string;
      status?: string;
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: {
        id?: string;
        username?: string;
      };
    }>;
    error?: {
      message?: string;
      type?: string;
      code?: number;
      error_subcode?: number;
      fbtrace_id?: string;
    };
  };

  let data: MetaGraphResponse = {};

  try {
    data = await response.json() as typeof data;
  } catch {
    console.error("[Instagram Graph API Invalid Response]", {
      endpoint,
      status: response.status,
      statusText: response.statusText,
    });

    throw new Error(
      `Meta API returned an invalid response at ${path} (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    const metaError = data?.error;

    console.error("[Instagram Graph API Error]", {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      metaError: {
        message: metaError?.message,
        type: metaError?.type,
        code: metaError?.code,
        error_subcode: metaError?.error_subcode,
        fbtrace_id: metaError?.fbtrace_id,
      },
    });

    throw new Error(
      `Meta API error at ${path} (HTTP ${response.status}): ${
        metaError?.message || "Unknown Meta API error"
      }`
    );
  }

  console.log("[Instagram Graph API Success]", {
    endpoint,
    status: response.status,
  });

  return data;
}


export async function GET(req: NextRequest) {
  const destination = new URL("/instagram", req.url);
  const fail = (message: string) => {
    destination.searchParams.set("error", message.slice(0, 240));
    const response = NextResponse.redirect(destination);
    response.cookies.delete("ig_oauth_state");
    response.cookies.delete("ig_oauth_workspace");
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
    const workspaceId = req.cookies.get("ig_oauth_workspace")?.value;
    if (!workspaceId) throw new Error("Instagram workspace context expired. Connect again.");
    const { data: workspace } = await supabase.from("channel_workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).eq("is_active", true).maybeSingle();
    if (!workspace) throw new Error("Instagram workspace not found.");
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
    if (!shortLived.access_token) {
      throw new Error("Meta did not return a short-lived access token.");
    }

    const longLived = await graph("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token,
    });
    if (!longLived.access_token) {
      throw new Error("Meta did not return a long-lived access token.");
    }

    const accessToken = longLived.access_token;

    // Persist the permissions Meta actually granted, rather than assuming
    // every permission selected in the login configuration was approved.
    const permissionResult = await graph("me/permissions", { access_token: accessToken });
    const grantedScopes = (permissionResult.data ?? [])
      .filter(
        (permission): permission is typeof permission & { permission: string } =>
          permission.status === "granted" && typeof permission.permission === "string",
      )
      .map((permission) => permission.permission);

    const pages = await graph("me/accounts", {
      fields: "id,name,access_token,instagram_business_account{id,username}",
      access_token: accessToken,
    });

    const page = (pages.data ?? []).find(
      (candidate) =>
        candidate.instagram_business_account?.id && candidate.instagram_business_account?.username,
    );

    if (!page?.instagram_business_account?.id || !page.instagram_business_account.username) {
      throw new Error(
        "No linked Instagram Business or Creator account was returned. Confirm that the Facebook user has access to the Page and that the Instagram professional account is linked to it.",
      );
    }
    if (!page.access_token) {
      throw new Error("Meta did not return a Page access token for the linked Instagram account.");
    }

    const instagramAccount = page.instagram_business_account;
    const { error } = await supabase.from("instagram_connections").upsert(
      {
        owner_id: user.id,
        workspace_id: workspaceId,
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
      { onConflict: "workspace_id" },
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
  response.cookies.delete("ig_oauth_workspace");
  return response;
}
