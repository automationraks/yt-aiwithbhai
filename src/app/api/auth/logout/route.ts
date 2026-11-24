import { NextRequest, NextResponse } from "next/server";
import { APP_SESSION_COOKIE, createSupabaseAdminClient, hashSessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const token = request.cookies.get(APP_SESSION_COOKIE)?.value;
  if (token) {
    try {
      await createSupabaseAdminClient().from("app_sessions")
        .delete().eq("token_hash", hashSessionToken(token));
    } catch (error) {
      console.error("[app logout]", error);
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(APP_SESSION_COOKIE, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 0,
  });
  return response;
}
