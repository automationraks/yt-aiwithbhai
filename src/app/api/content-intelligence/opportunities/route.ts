import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/context";
export const dynamic = "force-dynamic";
type Row = { title: string | null; description?: string | null; view_count?: number | null; published_at?: string | null; competitor_id?: string | null };
const TOPICS: Array<{ name: string; re: RegExp; fit: number }> = [
 { name: "AI agents and orchestration", re: /\b(agent|agentic|multi-agent|orchestration|tool calling)\b/i, fit: 94 },
 { name: "RAG and retrieval systems", re: /\b(rag|retrieval|embedding|vector database|semantic search)\b/i, fit: 95 },
 { name: "AI architecture and system design", re: /\b(architecture|system design|reference architecture|enterprise ai)\b/i, fit: 98 },
 { name: "LLMOps and evaluation", re: /\b(llmops|evaluation|observability|tracing|benchmark)\b/i, fit: 92 },
 { name: "Inference and model serving", re: /\b(inference|serving|gpu|quantization|vllm|latency)\b/i, fit: 90 },
 { name: "AI security and governance", re: /\b(security|guardrail|governance|prompt injection)\b/i, fit: 88 },
 { name: "AI automation", re: /\b(automation|workflow|n8n|zapier|make.com)\b/i, fit: 86 }
];
export async function GET() {
 const db = await createSupabaseServerClient();
 if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
 const { data: { user } } = await db.auth.getUser();
 if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 const ws = await getActiveWorkspace(db, user.id);
 if (!ws) return NextResponse.json({ opportunities: [], activeWorkspace: null });
 const { data, error } = await db.from("content_opportunity_scores").select("*")
  .eq("owner_id", user.id).eq("workspace_id", ws.id).order("overall_score", { ascending: false }).limit(50);
 if (error) return NextResponse.json({ error: "Apply Phase L-P migration before loading opportunities.", details: error.message }, { status: 503 });
 return NextResponse.json({ opportunities: data ?? [], activeWorkspace: ws });
}
export async function POST() {
 const db = await createSupabaseServerClient();
 if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
 const { data: { user } } = await db.auth.getUser();
 if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 const ws = await getActiveWorkspace(db, user.id);
 if (!ws) return NextResponse.json({ error: "Create a workspace first." }, { status: 409 });
 const { data: competitors, error: ce } = await db.from("competitors").select("id,channel_title,subscriber_count")
  .eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified").limit(150);
 if (ce) return NextResponse.json({ error: "Could not load qualified competitors.", details: ce.message }, { status: 500 });
 const ids = (competitors ?? []).map((x: { id: string }) => x.id);
 const { data: videos, error: ve } = ids.length
  ? await db.from("videos").select("title,description,view_count,published_at,competitor_id").in("competitor_id", ids).eq("is_niche_relevant", true).order("published_at", { ascending: false }).limit(500)
  : { data: [] as Row[], error: null };
 if (ve) return NextResponse.json({ error: "Could not load competitor videos.", details: ve.message }, { status: 500 });
 const sample = (videos ?? []) as Row[];
 const today = new Date().toISOString().slice(0, 10);
 const rows = TOPICS.map(topic => {
  const matches = sample.filter(v => topic.re.test((v.title ?? "") + " " + (v.description ?? "")));
  const recent = matches.filter(v => v.published_at && Date.now() - Date.parse(v.published_at) <= 30 * 86400000);
  const avgViews = matches.length ? matches.reduce((n, v) => n + Number(v.view_count ?? 0), 0) / matches.length : 0;
  const demand = Math.min(100, Math.round(Math.log10(Math.max(avgViews, 1) + 1) * 18 + Math.min(recent.length, 8) * 4));
  const competition = Math.min(100, matches.length * 8);
  const novelty = Math.max(10, 100 - competition);
  const fit = topic.fit;
  const overall = Math.round(demand * .35 + (100 - competition) * .2 + fit * .3 + novelty * .15);
  return { owner_id: user.id, workspace_id: ws.id, report_date: today, topic: topic.name,
   title: "Practical field guide: " + topic.name, rationale: matches.length
    ? "Scored from " + matches.length + " matching videos across " + (competitors ?? []).length + " qualified channels; this is a saved-sample signal, not market-wide demand."
    : "No matching videos were found in the saved competitor sample. Validate audience demand before production.",
   demand_score: demand, competition_score: competition, fit_score: fit, novelty_score: novelty,
   overall_score: overall, evidence: { sampleCount: matches.length, recent30Days: recent.length, averageViews: Math.round(avgViews), source: "saved_competitor_sample" } };
 });
 const { data, error } = await db.from("content_opportunity_scores").upsert(rows, { onConflict: "owner_id,workspace_id,report_date,title" }).select("*");
 if (error) return NextResponse.json({ error: "Could not persist opportunity scores.", details: error.message }, { status: 500 });
 return NextResponse.json({ opportunities: data ?? [], scoredCount: rows.length, sampleSize: sample.length, competitorCount: (competitors ?? []).length, scoring: "heuristic_from_saved_data" });
}
