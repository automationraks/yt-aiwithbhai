import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await context.params;
  const { data: idea, error } = await supabase.from("content_ideas").select("id,video_production_status,video_storage_path")
    .eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (error || !idea) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  if (idea.video_production_status !== "ready" || !idea.video_storage_path)
    return NextResponse.json({ error: "Video is not verified and ready for review." }, { status: 409 });
  const { data, error: signError } = await supabase.storage.from("generated-videos").createSignedUrl(idea.video_storage_path, 300);
  if (signError || !data?.signedUrl) return NextResponse.json({ error: "Could not create secure video link." }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl, expiresInSeconds: 300 });
}
