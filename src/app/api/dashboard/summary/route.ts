import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [competitors, videos, ideas, workflows] = await Promise.all([
    supabase.from("competitors").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("videos").select("id", { count: "exact", head: true }),
    supabase.from("content_ideas").select("id", { count: "exact", head: true }),
    supabase.from("automation_runs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
  ]);

  const failed = [competitors, videos, ideas, workflows].find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json({ error: "Unable to load dashboard metrics.", details: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({
    metrics: {
      competitors: competitors.count ?? 0,
      videos: videos.count ?? 0,
      ideas: ideas.count ?? 0,
      workflows: workflows.count ?? 0,
    },
  });
}
