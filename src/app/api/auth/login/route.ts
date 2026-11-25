import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { APP_SESSION_COOKIE, APP_SESSION_MAX_AGE, createSupabaseAdminClient, hashSessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const scrypt = promisify(scryptCallback);

async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), 64) as Buffer;
  const expectedBuffer = Buffer.from(expected, "base64url");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 1 || password.length > 256) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: user, error } = await supabase.from("app_users")
      .select("id,email,password_hash,display_name,role").eq("email", email).maybeSingle();
    if (error) throw error;
    if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + APP_SESSION_MAX_AGE * 1000).toISOString();
    const { error: sessionError } = await supabase.from("app_sessions").insert({
      user_id: user.id, token_hash: hashSessionToken(token), expires_at: expiresAt,
    });
    if (sessionError) throw sessionError;
    await supabase.from("app_sessions").delete().lt("expires_at", new Date().toISOString());

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
    });
    response.cookies.set(APP_SESSION_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
      path: "/", maxAge: APP_SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    console.error("[app login]", error);
    return NextResponse.json({ error: "Login service is unavailable. Check the database configuration." }, { status: 503 });
  }
}
