import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:a}=await db.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const since=new Date(Date.now()-30*86400000).toISOString();
 const [eventsResult,ideasResult,usageResult]=await Promise.all([
  db.from("workflow_event_logs").select("id,idea_id,workflow,event_key,stage,status,message,metadata,created_at").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(500),
  db.from("content_ideas").select("id,title,status,video_production_status,created_at,target_duration_seconds").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(500),
  db.from("ai_usage_logs").select("id,idea_id,task,provider,model,input_tokens,output_tokens,total_tokens,estimated_cost_usd,cost_currency,cost_is_estimate,fallback_used,duration_ms,created_at").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(1000)
 ]);
 if(eventsResult.error)return NextResponse.json({error:"Could not load workflow events.",details:eventsResult.error.message},{status:500});
 if(ideasResult.error)return NextResponse.json({error:ideasResult.error.message},{status:500});
 if(usageResult.error)return NextResponse.json({error:"Could not load AI usage. Apply migration 20261126000100 first.",details:usageResult.error.message},{status:500});
 const events=eventsResult.data??[],ideas=ideasResult.data??[],usage=usageResult.data??[],generation=events.filter(e=>e.workflow==="idea_generation"&&e.event_key==="generation_completed");
 const recent=events.filter(e=>e.created_at>=since),sum=(key:"input_tokens"|"output_tokens"|"total_tokens")=>usage.reduce((n,x)=>n+Number(x[key]??0),0);
 return NextResponse.json({stats:{
 totalIdeasSaved:ideas.length,generatedRuns:generation.length,totalGenerated:generation.reduce((n,e)=>n+Number(e.metadata?.generated??0),0),
 duplicatesSkipped:generation.reduce((n,e)=>n+Math.max(0,Number(e.metadata?.generated??0)-Number(e.metadata?.newlySaved??0)),0),
 generatedLast30Days:generation.filter(e=>e.created_at>=since).reduce((n,e)=>n+Number(e.metadata?.generated??0),0),
 approved:ideas.filter(i=>i.status==="approved"||["queued","processing","ready"].includes(String(i.video_production_status))).length,
 queued:ideas.filter(i=>i.video_production_status==="queued").length,processing:ideas.filter(i=>i.video_production_status==="processing").length,
 completed:ideas.filter(i=>["ready","review_required"].includes(String(i.video_production_status))).length,failed:ideas.filter(i=>i.video_production_status==="failed").length,
 generatedByProvider:usage.reduce<Record<string,number>>((a,x)=>{a[x.model]=(a[x.model]??0)+1;return a;},{}),
 inputTokens:sum("input_tokens"),outputTokens:sum("output_tokens"),totalTokens:sum("total_tokens"),
 estimatedCostUsd:Number(usage.reduce((n,x)=>n+Number(x.estimated_cost_usd??0),0).toFixed(8))
 },ideas,usage,events:recent});
}