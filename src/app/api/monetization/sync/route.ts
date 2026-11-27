import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/context";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
 const db = await createSupabaseServerClient();
 if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
 const { data: { user } } = await db.auth.getUser();
 if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 const ws = await getActiveWorkspace(db, user.id);
 if (!ws) return NextResponse.json({ error: "Create a workspace first." }, { status: 409 });
 let body: Record<string, unknown>;
 try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
 const platform = body.platform;
 const reportDate = body.reportDate;
 const source = typeof body.source === "string" ? body.source.slice(0, 80) : "manual_import";
 const currency = body.currency ?? "INR";
 const allowedCurrencies = ["INR", "USD", "EUR", "GBP"];
 if ((platform !== "youtube" && platform !== "instagram") || typeof reportDate !== "string" ||
  !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !allowedCurrencies.includes(String(currency))) {
  return NextResponse.json({ error: "Provide a valid platform, reportDate (YYYY-MM-DD), and supported currency." }, { status: 400 });
 }
 const number = (v: unknown) => Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0;
 const metrics = {
  owner_id: user.id, workspace_id: ws.id, platform, report_date: reportDate,
  views: Math.floor(number(body.views)), watch_time_minutes: number(body.watchTimeMinutes),
  followers_gained: Math.floor(number(body.followersGained)), subscribers_gained: Math.floor(number(body.subscribersGained)),
  revenue: number(body.revenue), currency, source, raw_data: body.rawData && typeof body.rawData === "object" ? body.rawData : {}
 };
 const { data, error } = await db.from("platform_analytics_imports")
  .upsert(metrics, { onConflict: "owner_id,workspace_id,platform,report_date,source" }).select("*").single();
 if (error) return NextResponse.json({ error: "Could not import analytics. Apply Phase L-P migration first.", details: error.message }, { status: 500 });
 if (metrics.revenue > 0) {
  const { data: existingRevenue } = await db.from("monetization_entries").select("id")
   .eq("owner_id", user.id).eq("workspace_id", ws.id).eq("platform", platform)
   .eq("entry_date", reportDate).eq("source_name", source).maybeSingle();
  const revenueRow = {
   owner_id: user.id, workspace_id: ws.id, platform, revenue_type: "ad_revenue",
   amount: metrics.revenue, currency, entry_date: reportDate, source_name: source,
   notes: "Imported platform analytics; verify against the platform's finalized revenue report."
  };
  if (existingRevenue?.id) await db.from("monetization_entries").update(revenueRow).eq("id", existingRevenue.id).eq("owner_id", user.id);
  else await db.from("monetization_entries").insert(revenueRow);
 }
 return NextResponse.json({ ok: true, import: data, source, mode: "user_supplied_analytics_import" });
}
