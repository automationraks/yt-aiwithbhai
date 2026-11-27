import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data, error } = await supabase.rpc("get_youtube_quota_status");
  if (error) {
    return NextResponse.json({
      error: "Quota tracking is not installed. Run the latest SQL migration in Supabase.",
      details: error.message,
      migrationRequired: true,
    }, { status: 503 });
  }

  const quota=data as {search?:{used?:number;limit?:number;remaining?:number};general?:{used?:number;limit?:number;remaining?:number}};
  const warnings=[...([quota.search,quota.general].map((bucket,index)=>({name:index===0?"search":"general",bucket})).filter(x=>x.bucket?.limit&&Number(x.bucket.used??0)/Number(x.bucket.limit)>=0.8).map(x=>({bucket:x.name,level:Number(x.bucket?.used??0)/Number(x.bucket?.limit??1)>=0.95?"critical":"warning",message:x.name+" quota usage is at least "+Math.round(Number(x.bucket?.used??0)/Number(x.bucket?.limit??1)*100)+"%."})))];
  return NextResponse.json({ quota: data, warnings });
}
