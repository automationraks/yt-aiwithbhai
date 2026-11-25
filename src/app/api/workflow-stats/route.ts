import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [eventsResult, ideasResult] = await Promise.all([
    db.from("workflow_event_logs").select("id,idea_id,workflow,event_key,stage,status,message,metadata,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(500),
    db.from("content_ideas").select("id,status,video_production_status,created_at").eq("owner_id", user.id),
  ]);
  if (eventsResult.error) return NextResponse.json({ error: "Could not load workflow events. Apply the workflow event migration first.", details: eventsResult.error.message }, { status: 500 });
  if (ideasResult.error) return NextResponse.json({ error: ideasResult.error.message }, { status: 500 });
  const events = eventsResult.data ?? [];
  const ideas = ideasResult.data ?? [];
  const generationEvents = events.filter((event) => event.workflow === "idea_generation" && event.event_key === "generation_completed");
  const recentEvents = events.filter((event) => event.created_at >= since);
  return NextResponse.json({
    stats: {
      totalIdeasSaved: ideas.length,
      generatedRuns: generationEvents.length,
      generatedLast30Days: generationEvents.filter((event) => event.created_at >= since).reduce((sum, event) => sum + Number(event.metadata?.generated ?? 0), 0),
      approved: ideas.filter((idea) => idea.status === "approved" || ["queued", "processing", "ready"].includes(String(idea.video_production_status))).length,
      queued: ideas.filter((idea) => idea.video_production_status === "queued").length,
      processing: ideas.filter((idea) => idea.video_production_status === "processing").length,
      completed: ideas.filter((idea) => ["ready", "review_required"].includes(String(idea.video_production_status))).length,
      failed: ideas.filter((idea) => idea.video_production_status === "failed").length,
      generatedByProvider: generationEvents.reduce<Record<string, number>>((acc, event) => { const provider = String(event.metadata?.provider ?? "unknown"); acc[provider] = (acc[provider] ?? 0) + Number(event.metadata?.generated ?? 0); return acc; }, {}),
    },
    events: recentEvents,
  });
}
