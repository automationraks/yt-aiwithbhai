import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhook = process.env.N8N_DAILY_CONTENT_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json(
      { error: "N8N_DAILY_CONTENT_WEBHOOK_URL is not configured." },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        event: "daily_content_research",
        brand: "AIWithBh@i",
        niche: "Practical AI engineering, AI systems and automation",
        scheduledAt: new Date().toISOString(),
        timezone: "Asia/Kolkata",
        output: {
          platforms: ["youtube_shorts", "instagram_reels"],
          aspectRatio: "9:16",
          minimumDurationSeconds: 30,
          maximumDurationSeconds: 60,
          durationBands: { simple: [30, 40], medium: [40, 50], complex: [50, 60] },
          requireManualApprovalBeforeVideoProduction: true,
          requireManualApprovalBeforePublishing: true,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 1000);
      return NextResponse.json(
        { error: "n8n daily research webhook failed.", status: response.status, details },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, dispatched: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Daily content dispatch failed." },
      { status: 502 }
    );
  }
}
