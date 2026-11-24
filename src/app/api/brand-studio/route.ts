import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateResearchJson } from "@/lib/ai/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BrandPackage = {
  titleOptions?: string[];
  selectedTitle?: string;
  description?: string;
  tags?: string[];
  hashtags?: string[];
  pinnedComment?: string;
  thumbnailConcepts?: Array<{ concept: string; visual: string; textOverlay: string; composition: string }>;
  visualIdentity?: { palette: string[]; typography: string; editingStyle: string; bRollStyle: string };
  openingFrame?: string;
  chapters?: Array<{ timestamp: string; label: string }>;
  productionChecklist?: string[];
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [assetsResult, calendarResult] = await Promise.all([
    supabase.from("brand_studio_assets").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }),
    supabase.from("content_calendar").select("id,title,status,scheduled_date").eq("owner_id", user.id).order("created_at", { ascending: false })
  ]);
  if (assetsResult.error) return NextResponse.json({ error: "Could not load Brand Studio assets.", details: assetsResult.error.message, code: assetsResult.error.code }, { status: 500 });
  if (calendarResult.error) return NextResponse.json({ error: "Could not load calendar topics.", details: calendarResult.error.message, code: calendarResult.error.code }, { status: 500 });
  return NextResponse.json({ assets: assetsResult.data ?? [], items: calendarResult.data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let input: unknown;
  try { input = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const calendarId = typeof input === "object" && input !== null && "calendarId" in input ? String((input as { calendarId: unknown }).calendarId) : "";
  if (!calendarId) return NextResponse.json({ error: "Choose a calendar Short first." }, { status: 400 });

  const { data: item, error: itemError } = await supabase.from("content_calendar").select("id,title,target_duration_seconds").eq("id", calendarId).eq("owner_id", user.id).single();
  if (itemError || !item) return NextResponse.json({ error: "Calendar item not found." }, { status: 404 });
  const { data: script, error: scriptError } = await supabase.from("content_scripts").select("*").eq("calendar_id", calendarId).eq("owner_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle();
  if (scriptError || !script) return NextResponse.json({ error: "Generate a research-backed script in Content Calendar before using Brand Studio." }, { status: 409 });
  const { data: brief, error: briefError } = await supabase.from("content_research_briefs").select("*").eq("calendar_id", calendarId).eq("owner_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (briefError) return NextResponse.json({ error: "Could not load the saved research snapshot.", details: briefError.message }, { status: 500 });

  const { data: brandIdentity } = await supabase.from("brand_identity").select("brand_name,display_name,bio,category,brand_pillars,voice_guidelines,color_palette").eq("owner_id", user.id).maybeSingle();
  const system = `You are the channel brand and packaging editor for AIWithBh@i, an educational YouTube channel for software engineers and IT professionals. Create a coherent, accurate publishing package for one 50-60 second YouTube Short. The channel teaches production AI systems, LLM engineering, RAG, agents, vector databases, inference, evaluation, observability, security, cost, latency and reliability. Return JSON only with this shape: {titleOptions:[3 concise accurate titles],selectedTitle:"",description:"2-4 useful sentences, no unsupported claims",tags:[8-15 relevant search phrases],hashtags:[3-5],pinnedComment:"one useful discussion prompt",thumbnailConcepts:[{concept,visual,textOverlay,composition}],visualIdentity:{palette:[3-5 color names or hex values],typography,editingStyle,bRollStyle},openingFrame:"specific first-frame visual",chapters:[{timestamp,label}],productionChecklist:[...]}. Titles must create curiosity without misleading clickbait. Thumbnail text should be 2-4 words maximum and legible on mobile. Avoid generic AI imagery, fake metrics, keyword stuffing and claims not supported by the supplied research or script. Keep the brand technical, clear, modern and consistent. Chapters must fit the supplied Short duration. Use only facts in the supplied script and research snapshot; do not invent sources or product capabilities. Follow this saved brand identity when present: ${JSON.stringify(brandIdentity ?? { brand_name: "AIWithBh@i", display_name: "AIWithBh@i | AI Automation", brand_pillars: ["AI Tools", "AI Agents", "Automation", "Tutorials", "Projects"], voice_guidelines: "Practical, clear, technically accurate and beginner-friendly.", color_palette: ["#090D14", "#22D3EE", "#A78BFA"] })}.`;
  try {
    const generated = await generateResearchJson(system, JSON.stringify({
      topic: item.title,
      durationSeconds: script.estimated_duration_seconds,
      script: script.script,
      hook: script.hook,
      outline: script.outline,
      researchSnapshot: brief?.research_snapshot ?? {},
      sourceReferences: brief?.source_references ?? []
    }));
    const pkg = generated.data as BrandPackage;
    if (!Array.isArray(pkg.titleOptions) || pkg.titleOptions.length < 2 || !String(pkg.description ?? "").trim() || !Array.isArray(pkg.tags) || !Array.isArray(pkg.thumbnailConcepts) || !pkg.visualIdentity) {
      throw new Error("The generated brand package is incomplete. Please regenerate.");
    }
    const { data: previous } = await supabase.from("brand_studio_assets").select("version").eq("script_id", script.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: saved, error: saveError } = await supabase.from("brand_studio_assets").insert({
      owner_id: user.id,
      calendar_id: calendarId,
      script_id: script.id,
      version: (previous?.version ?? 0) + 1,
      brand_package: pkg,
      provider: generated.provider,
      status: "draft"
    }).select("*").single();
    if (saveError) throw new Error("Could not save Brand Studio package: " + saveError.message);
    return NextResponse.json({ asset: saved, provider: generated.provider, fallbackUsed: generated.fallbackUsed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Brand package generation failed." }, { status: 502 });
  }
}
