import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAIConfiguration } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [profile, keywords] = await Promise.all([
    supabase.from("channel_profile").select("id").eq("owner_id", user.id).maybeSingle(),
    supabase.from("keyword_library").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_active", true),
  ]);
  const ai = getAIConfiguration();
  return NextResponse.json({
    checks: [
      { id: "supabase", title: "Create Supabase project", ready: !profile.error, detail: !profile.error ? "Database and authenticated session responding" : "Database query failed" },
      { id: "ai", title: "Add AI provider keys", ready: ai.configured, detail: ai.configured ? `Available: ${ai.available.join(", ")}` : "Add GEMINI_API_KEY or GROQ_API_KEY to server environment" },
      { id: "youtube", title: "Connect YouTube Data API", ready: Boolean(process.env.YOUTUBE_API_KEY), detail: process.env.YOUTUBE_API_KEY ? "Server API key is configured" : "Add YOUTUBE_API_KEY to server environment" },
      { id: "n8n", title: "Configure n8n Cloud", ready: Boolean(process.env.N8N_BASE_URL && process.env.N8N_WEBHOOK_SECRET), detail: process.env.N8N_BASE_URL && process.env.N8N_WEBHOOK_SECRET ? "Webhook credentials configured (live workflow test pending)" : "Add N8N_BASE_URL and N8N_WEBHOOK_SECRET" },
      { id: "keywords", title: "Set channel research keywords", ready: !keywords.error && (keywords.count ?? 0) > 0, detail: keywords.error ? "Could not read keyword library" : `${keywords.count ?? 0} active saved keywords` },
    ],
    ai: { primary: ai.primary, available: ai.available, fallback: ai.fallback },
  });
}
