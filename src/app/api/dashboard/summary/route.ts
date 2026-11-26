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

  const [competitors, videos, ideas, workflows, publishing] = await Promise.all([
    supabase.from("competitors").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified"),
    supabase.from("videos").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_niche_relevant", true),
    supabase.from("content_ideas").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    supabase.from("automation_runs").select("id", { count: "exact", head: true }).eq("owner_id", user.id).in("status", ["queued", "running"]),
    supabase.from("publishing_targets").select("status,dispatch_status").eq("owner_id", user.id),
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
      publishingConfigured: !publishing.error,
      publishingScheduled: publishing.data?.filter((x) => x.status === "scheduled").length ?? 0,
      publishingInProgress: publishing.data?.filter((x) => x.status === "publishing").length ?? 0,
      publishingPublished: publishing.data?.filter((x) => x.status === "published").length ?? 0,
      publishingFailed: publishing.data?.filter((x) => x.status === "failed" || x.dispatch_status === "failed").length ?? 0,
    },
  });
}
