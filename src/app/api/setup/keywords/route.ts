import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const defaults = [
  ["AI system design for software engineers", "en", "AI system design"],
  ["LLM application architecture", "en", "LLM engineering"],
  ["RAG architecture vector databases", "en", "RAG systems"],
  ["AI agent architecture orchestration", "en", "AI agents"],
  ["production AI systems engineering", "en", "Production AI"],
  ["AI system design explained in Hindi", "hi", "AI system design"],
  ["LLM architecture Hindi tutorial", "hi", "LLM engineering"],
  ["RAG pipeline vector database Hindi", "hi", "RAG systems"],
  ["AI agents kaise banaye architecture", "hi", "AI agents"],
  ["scalable AI applications system design", "en", "Scalable AI"],
] as const;

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rows = defaults.map(([keyword, language, category]) => ({
    owner_id: user.id,
    keyword,
    language,
    category,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from("keyword_library")
    .upsert(rows, { onConflict: "owner_id,keyword,language" })
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: "Could not save starter research keywords.", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    saved: data?.length ?? rows.length,
    total: rows.length,
    message: "AI systems architecture research keywords saved.",
  });
}
