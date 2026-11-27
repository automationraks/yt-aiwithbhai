import {NextRequest,NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/lib/auth/session";
import {logWorkflowEvent} from "@/lib/workflow-events";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
const TAXONOMY:Array<[string,RegExp]>=[["AI agents & orchestration",/\b(agent|agentic|multi-agent|orchestration|tool calling)\b/i],["RAG & retrieval",/\b(rag|retrieval|embedding|vector database|semantic search)\b/i],["AI architecture & system design",/\b(architecture|system design|reference architecture|enterprise ai)\b/i],["LLMOps & evaluation",/\b(llmops|evaluation|observability|tracing|benchmark|monitoring)\b/i],["Inference & model serving",/\b(inference|serving|gpu|quantization|vllm|latency)\b/i],["AI security & governance",/\b(security|guardrail|safety|governance|prompt injection)\b/i],["AI automation",/\b(automation|workflow|n8n|zapier|make.com)\b/i]];
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;if(!secret||req.headers.get("authorization")!=="Bearer "+secret)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=createSupabaseAdminClient(),today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const {data:users,error:userError}=await db.from("app_users").select("id");if(userError)return NextResponse.json({error:userError.message},{status:500});
 const generated:string[]=[],skipped:string[]=[],failed:Array<{ownerId:string;error:string}>=[];
 for(const user of users??[]){
  try{
   const {data:controls}=await db.from("operations_controls").select("enabled").eq("owner_id",user.id).eq("control_key","research_automation").maybeSingle();
   if(controls?.enabled===false){skipped.push(user.id);continue;}
   const [channels,yt,ig]=await Promise.all([
    db.from("competitors").select("id,channel_title").eq("owner_id",user.id).eq("is_active",true).eq("ai_production_status","qualified").limit(100),
    db.from("videos").select("title,description,view_count,published_at,competitor_id").eq("is_niche_relevant",true).order("published_at",{ascending:false}).limit(500),
    db.from("instagram_content_sources").select("caption,source_username,timestamp").eq("owner_id",user.id).order("timestamp",{ascending:false}).limit(200)
   ]);
   if(channels.error||yt.error||ig.error)throw new Error(channels.error?.message??yt.error?.message??ig.error?.message);
   const channelIds=new Set((channels.data??[]).map(x=>x.id)),channelMap=new Map((channels.data??[]).map(x=>[x.id,x.channel_title]));
   const samples=[...(yt.data??[]).filter(v=>channelIds.has(v.competitor_id)).map(v=>({title:v.title??"",description:v.description??"",views:Number(v.view_count??0),publishedAt:v.published_at,platform:"youtube",channel:channelMap.get(v.competitor_id)??null})),...(ig.data??[]).map(v=>({title:v.caption??"Instagram post",description:v.caption??"",views:0,publishedAt:v.timestamp,platform:"instagram",channel:v.source_username??null}))];
   const topics=TAXONOMY.map(([name,pattern])=>{const found=samples.filter(v=>pattern.test(v.title+" "+v.description));return{name,mentions:found.length,averageViews:found.length?Math.round(found.reduce((n,v)=>n+v.views,0)/found.length):0,topExamples:found.sort((a,b)=>b.views-a.views).slice(0,3)};}).filter(x=>x.mentions>0).sort((a,b)=>b.mentions-a.mentions).slice(0,7);
   const recent=samples.filter(v=>v.publishedAt&&Date.now()-Date.parse(v.publishedAt)<=30*86400000).length;
   const gaps=topics.map(t=>({topic:t.name,reason:t.mentions<3?"Limited coverage in the saved sample; validate demand before production.":"Competitors cover this area; use a distinct implementation case study.",sampleCount:t.mentions,opportunity:t.mentions<3?"Potential coverage gap":"Differentiation opportunity"}));
   const recommendations=topics.slice(0,4).map(t=>"Create an original, case-study-first lesson on "+t.name+"; "+t.mentions+" sampled items currently match this topic.");
   recommendations.push("Treat views as a directional sample only; validate the idea with audience questions and a practical demonstration.");
   const report={owner_id:user.id,report_date:today,summary:"Daily scan analysed "+samples.length+" saved public items from "+(channels.data??[]).length+" qualified channels. "+recent+" sampled items have dates within the last 30 days. This is a limited saved sample, not market-wide trend data.",trending_topics:topics,content_gaps:gaps,recommendations,source_counts:{youtube:samples.filter(x=>x.platform==="youtube").length,instagram:samples.filter(x=>x.platform==="instagram").length,qualifiedChannels:(channels.data??[]).length,recent30Days:recent},generated_at:new Date().toISOString()};
   const {error:saveError}=await db.from("content_intelligence_reports").upsert(report,{onConflict:"owner_id,report_date"});if(saveError)throw saveError;
   await logWorkflowEvent({ownerId:user.id,workflow:"idea_generation",eventKey:"content_intelligence_daily",stage:"daily_research",status:"completed",message:"Daily content intelligence scan completed.",metadata:{sources:report.source_counts,topicCount:topics.length}});
   generated.push(user.id);
  }catch(e){const message=e instanceof Error?e.message:"Daily intelligence scan failed.";failed.push({ownerId:user.id,error:message});await logWorkflowEvent({ownerId:user.id,workflow:"idea_generation",eventKey:"content_intelligence_daily_failed",stage:"daily_research",status:"failed",message,metadata:{}});}
 }
 return NextResponse.json({ok:failed.length===0,date:today,owners:users?.length??0,generated:generated.length,skipped:skipped.length,failed});
}