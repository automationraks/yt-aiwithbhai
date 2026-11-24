import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const APP_SESSION_COOKIE = "aiwithbhai_session";
export const APP_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type AppUser = {
  id: string;
  email: string;
  display_name?: string | null;
  role?: string | null;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase database credentials are not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function verifySessionToken(token: string | undefined | null): Promise<AppUser | null> {
  if (!token || token.length < 32 || token.length > 256) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data: session, error } = await supabase
      .from("app_sessions")
      .select("user_id")
      .eq("token_hash", hashSessionToken(token))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !session) return null;
    const { data: user, error: userError } = await supabase
      .from("app_users")
      .select("id,email,display_name,role")
      .eq("id", session.user_id)
      .maybeSingle();
    if (userError || !user) return null;
    return user as AppUser;
  } catch {
    return null;
  }
}

export async function getAppUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value);
}

export async function createSupabaseServerClient() {
  let client: SupabaseClient;
  try {
    client = createSupabaseAdminClient();
  } catch {
    return null;
  }
  // Compatibility shim: existing protected API handlers call auth.getUser().
  // The identity comes from our own opaque, database-backed session cookie.
  const auth = client.auth as unknown as {
    getUser: () => Promise<{ data: { user: AppUser | null }; error: null }>;
  };
  auth.getUser = async () => ({ data: { user: await getAppUser() }, error: null });
  return client;
}
