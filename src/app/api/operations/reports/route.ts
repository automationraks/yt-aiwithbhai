import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const since=new Date(Date.now()-30*86400000).toISOString();
 const [eventsResult,usageResult,ideasResult]=await Promise.all([
  db.from("workflow_event_logs").select("workflow,status,created_at").eq("owner_id",user.id).gte("created_at",since).order("created_at",{ascending:true}).limit(5000),
  db.from("ai_usage_logs").select("total_tokens,estimated_cost_usd,provider,created_at").eq("owner_id",user.id).gte("created_at",since).order("created_at",{ascending:true}).limit(5000),
  db.from("content_ideas").select("id,status,video_production_status,created_at").eq("owner_id",user.id).gte("created_at",since).is("deleted_at",null).limit(2000)
 ]);
 if(eventsResult.error||usageResult.error||ideasResult.error)return NextResponse.json({error:"Could not generate operations report.",details:eventsResult.error?.message??usageResult.error?.message??ideasResult.error?.message},{status:500});
 const events=eventsResult.data??[],usage=usageResult.data??[],ideas=ideasResult.data??[];
 const daily=Array.from({length:30},(_,i)=>{const d=new Date(Date.now()-(29-i)*86400000),key=d.toISOString().slice(0,10),ev=events.filter(x=>x.created_at.slice(0,10)===key),us=usage.filter(x=>x.created_at.slice(0,10)===key);return{date:key,workflowEvents:ev.length,failures:ev.filter(x=>x.status==="failed").length,completed:ev.filter(x=>x.status==="completed").length,aiCalls:us.length,tokens:us.reduce((n,x)=>n+Number(x.total_tokens??0),0),estimatedCostUsd:Number(us.reduce((n,x)=>n+Number(x.estimated_cost_usd??0),0).toFixed(6))};});
 const summary={periodDays:30,workflowEvents:events.length,failures:events.filter(x=>x.status==="failed").length,completed:events.filter(x=>x.status==="completed").length,aiCalls:usage.length,tokens:usage.reduce((n,x)=>n+Number(x.total_tokens??0),0),estimatedCostUsd:Number(usage.reduce((n,x)=>n+Number(x.estimated_cost_usd??0),0).toFixed(6)),ideasCreated:ideas.length,productionFailed:ideas.filter(x=>x.video_production_status==="failed").length,productionCompleted:ideas.filter(x=>["ready","review_required"].includes(String(x.video_production_status))).length};
 return NextResponse.json({summary,daily,generatedAt:new Date().toISOString(),limitations:["Metrics cover retained application event and AI usage logs only.","Estimated costs are not provider invoices.","Publication success is based on callback events received by this application."]});
}