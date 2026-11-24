import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { APP_SESSION_COOKIE, APP_SESSION_MAX_AGE, createSupabaseAdminClient, hashSessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const scrypt = promisify(scryptCallback);

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown; displayName?: unknown; setupSecret?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
  const setupSecret = typeof body.setupSecret === "string" ? body.setupSecret : "";
  const configuredSecret = process.env.APP_SETUP_SECRET;
  if (!configuredSecret || setupSecret.length !== configuredSecret.length ||
      !Buffer.from(setupSecret).equals(Buffer.from(configuredSecret))) {
    return NextResponse.json({ error: "Account setup is not authorized. Check APP_SETUP_SECRET." }, { status: 403 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 12 || password.length > 256) return NextResponse.json({ error: "Use a password containing at least 12 characters." }, { status: 400 });

  try {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    const passwordHash = `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
    const supabase = createSupabaseAdminClient();
    const { data: userId, error } = await supabase.rpc("register_first_app_user", {
      p_email: email, p_password_hash: passwordHash, p_display_name: displayName || null,
    });
    if (error) {
      const message = error.message.includes("REGISTRATION_CLOSED")
        ? "Initial account setup is already complete. Ask the administrator to create additional accounts."
        : error.message.includes("EMAIL_NOT_ELIGIBLE")
          ? "This email cannot claim an existing account. Use the email address already registered for this workspace."
          : "Could not create the initial account. Verify the database migration and setup details.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + APP_SESSION_MAX_AGE * 1000).toISOString();
    const { error: sessionError } = await supabase.from("app_sessions").insert({
      user_id: userId, token_hash: hashSessionToken(token), expires_at: expiresAt,
    });
    if (sessionError) throw sessionError;
    const response = NextResponse.json({ ok: true, user: { id: userId, email, displayName } }, { status: 201 });
    response.cookies.set(APP_SESSION_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
      path: "/", maxAge: APP_SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    console.error("[app registration]", error);
    return NextResponse.json({ error: "Account setup failed. Check Supabase database configuration and migration status." }, { status: 503 });
  }
}
