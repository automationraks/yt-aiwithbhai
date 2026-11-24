import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = {
  brand_name: "AIWithBh@i",
  instagram_username: "automationraks",
  display_name: "AIWithBh@i | AI Automation",
  bio: "Building with AI. Automating the future.\n\n🤖 AI Agents | AI Automation | AI Tools\n⚙️ Practical AI workflows & experiments\n🚀 Follow for real-world AI systems",
  category: "Digital Creator",
  website_url: "",
  brand_pillars: ["AI Tools", "AI Agents", "Automation", "Tutorials", "Projects"],
  voice_guidelines: "Practical, clear, technically accurate, curious and beginner-friendly. Avoid hype and unsupported claims.",
  color_palette: ["#090D14", "#111925", "#22D3EE", "#A78BFA", "#F8FAFC"],
  profile_image_url: ""
};

async function getUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }) };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  return { supabase, user };
}

export async function GET() {
  const auth = await getUser();
  if (auth.error) return auth.error;
  const { data, error } = await auth.supabase!.from("brand_identity").select("*").eq("owner_id", auth.user!.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load brand identity.", details: error.message }, { status: 500 });
  return NextResponse.json({ profile: { ...DEFAULTS, ...(data ?? {}) } });
}

export async function PUT(request: Request) {
  const auth = await getUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const text = (key: string, fallback: string, max: number) => {
    const value = body[key] === undefined ? fallback : String(body[key] ?? "").trim();
    if (value.length > max) throw new Error(key + " is too long.");
    return value;
  };
  let payload;
  try {
    const displayName = text("display_name", DEFAULTS.display_name, 80);
    const bio = text("bio", DEFAULTS.bio, 150);
    const website = text("website_url", DEFAULTS.website_url, 500);
    if (!displayName || !bio) throw new Error("Display name and bio are required.");
    if (website && !/^https?:\/\//i.test(website)) throw new Error("Website URL must start with http:// or https://.");
    const pillars = Array.isArray(body.brand_pillars) ? body.brand_pillars.map(String).map(x => x.trim()).filter(Boolean).slice(0, 12) : DEFAULTS.brand_pillars;
    const palette = Array.isArray(body.color_palette) ? body.color_palette.map(String).map(x => x.trim()).filter(Boolean).slice(0, 8) : DEFAULTS.color_palette;
    payload = {
      owner_id: auth.user!.id,
      brand_name: "AIWithBh@i",
      instagram_username: "automationraks",
      display_name: displayName,
      bio,
      category: text("category", DEFAULTS.category, 80),
      website_url: website || null,
      brand_pillars: pillars,
      voice_guidelines: text("voice_guidelines", DEFAULTS.voice_guidelines, 2000),
      color_palette: palette,
      profile_image_url: text("profile_image_url", DEFAULTS.profile_image_url, 1000) || null,
      updated_at: new Date().toISOString()
    };
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid brand settings." }, { status: 400 });
  }
  const { data, error } = await auth.supabase!.from("brand_identity").upsert(payload, { onConflict: "owner_id" }).select("*").single();
  if (error) return NextResponse.json({ error: "Could not save brand identity. Apply the brand identity migration first.", details: error.message }, { status: 500 });
  return NextResponse.json({ profile: data, message: "AIWithBh@i brand identity saved." });
}
