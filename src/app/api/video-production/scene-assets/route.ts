import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/context";
import { generateResearchJson } from "@/lib/ai/research";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
 const db = await createSupabaseServerClient();
 if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
 const { data: { user } } = await db.auth.getUser();
 if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 const ws = await getActiveWorkspace(db, user.id);
 if (!ws) return NextResponse.json({ jobs: [] });
 const { data, error } = await db.from("scene_asset_jobs").select("*").eq("owner_id", user.id)
  .eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(100);
 if (error) return NextResponse.json({ error: "Apply Phase L-P migration first.", details: error.message }, { status: 503 });
 return NextResponse.json({ jobs: data ?? [] });
}
export async function POST(request: Request) {
 const db = await createSupabaseServerClient();
 if (!db) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
 const { data: { user } } = await db.auth.getUser();
 if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 let body: { ideaId?: unknown };
 try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
 if (typeof body.ideaId !== "string") return NextResponse.json({ error: "ideaId is required." }, { status: 400 });
 const ws = await getActiveWorkspace(db, user.id);
 if (!ws) return NextResponse.json({ error: "Create a workspace first." }, { status: 409 });
 const { data: idea, error } = await db.from("content_ideas")
  .select("id,title,status,script_package,approved_script_snapshot,approved_script_hash,channel_workspace_id")
  .eq("id", body.ideaId).eq("owner_id", user.id).maybeSingle();
 if (error || !idea) return NextResponse.json({ error: "Content idea not found." }, { status: 404 });
 if (idea.status !== "approved" || !idea.approved_script_hash || !idea.approved_script_snapshot)
  return NextResponse.json({ error: "Only owner-approved ideas with an immutable approved script can enter scene asset generation." }, { status: 409 });
 if (idea.channel_workspace_id && idea.channel_workspace_id !== ws.id)
  return NextResponse.json({ error: "This idea belongs to another workspace. Switch workspaces before continuing." }, { status: 409 });
 const script = idea.script_package ?? {};
 const scenes = Array.isArray(script.scenes) ? script.scenes : [];
 if (!scenes.length) return NextResponse.json({ error: "The approved script has no scene breakdown. Regenerate its production package first." }, { status: 409 });
 const prompt = "Create a JSON object with scenes array. For each input scene return sequence, visualPrompt, negativePrompt, cameraMotion, overlayText. Prompts must depict original, realistic AI engineering / industrial technology visuals, no logos, no copyrighted characters, no text baked into images. Keep every scene visually distinct. Input scenes: " + JSON.stringify(scenes);
 let generated: { data: unknown; provider: string; model: string };
 try {
  generated = await generateResearchJson("You are a professional vertical-video visual director. Return valid JSON only.", prompt, { task: "scene_asset_prompts" });
 } catch (e) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "AI scene prompt generation failed." }, { status: 503 });
 }
 const result = generated.data as { scenes?: Array<{ sequence?: number; visualPrompt?: string; negativePrompt?: string; cameraMotion?: string; overlayText?: string }> };
 if (!Array.isArray(result.scenes) || result.scenes.length !== scenes.length)
  return NextResponse.json({ error: "AI returned an incomplete scene prompt package. No jobs were queued." }, { status: 502 });
 const rows = result.scenes.map((s, i) => ({
  owner_id: user.id, workspace_id: ws.id, idea_id: idea.id, sequence: Number(s.sequence) || i + 1,
  prompt: String(s.visualPrompt ?? "").slice(0, 4000), negative_prompt: String(s.negativePrompt ?? "").slice(0, 1500),
  provider: "pending", status: "queued", metadata: { cameraMotion: s.cameraMotion ?? null, overlayText: s.overlayText ?? null, aiProvider: generated.provider, aiModel: generated.model, approvedScriptHash: idea.approved_script_hash }
 }));
 if (rows.some(x => !x.prompt)) return NextResponse.json({ error: "AI returned an empty visual prompt." }, { status: 502 });
 const { data, error: saveError } = await db.from("scene_asset_jobs").upsert(rows, { onConflict: "owner_id,idea_id,sequence" }).select("*");
 if (saveError) return NextResponse.json({ error: "Could not queue scene asset jobs.", details: saveError.message }, { status: 500 });
 return NextResponse.json({ jobs: data ?? [], queued: rows.length, providerStatus: "prompt_jobs_queued_external_image_worker_required", aiProvider: generated.provider });
}
