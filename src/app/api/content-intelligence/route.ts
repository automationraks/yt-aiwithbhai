import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {logWorkflowEvent} from "@/lib/workflow-events";
export const runtime="nodejs";export const dynamic="force-dynamic";
type Video={title:string|null;description?:string|null;view_count?:number|null;published_at?:string|null;platform?:string|null;source_channel_name?:string|null};
const TAXONOMY=[["AI agents & orchestration",/\b(agent|agentic|multi-agent|orchestration|tool calling)\b/i],["RAG & retrieval",/\b(rag|retrieval|embedding|vector database|semantic search)\b/i],["AI architecture & system design",/\b(architecture|system design|reference architecture|enterprise ai)\b/i],["LLMOps & evaluation",/\b(llmops|evaluation|observability|tracing|benchmark|monitoring)\b/i],["Inference & model serving",/\b(inference|serving|gpu|quantization|vllm|latency)\b/i],["AI security & governance",/\b(security|guardrail|safety|governance|prompt injection)\b/i],["AI automation",/\b(automation|workflow|n8n|zapier|make.com)\b/i]];
function rankTopics(videos:Video[]){return TAXONOMY.map(([name,pattern])=>{const matches=videos.filter(v=>pattern.test((v.title??"")+" "+(v.description??"")));const views=matches.map(v=>Number(v.view_count??0));return{name:String(name),mentions:matches.length,averageViews:views.length?Math.round(views.reduce((a,b)=>a+b,0)/views.length):0,topExamples:matches.sort((a,b)=>Number(b.view_count??0)-Number(a.view_count??0)).slice(0,3).map(v=>({title:v.title,views:Number(v.view_count??0),platform:v.platform??"youtube",channel:v.source_channel_name??null,publishedAt:v.published_at??null}))};}).filter(x=>x.mentions>0).sort((a,b)=>b.mentions-a.mentions);}
export async function GET(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const {data,error}=await db.from("content_intelligence_reports").select("*").eq("owner_id",user.id).order("report_date",{ascending:false}).limit(20);
 if(error)return NextResponse.json({error:"Could not load intelligence reports. Apply migration 20261127000300 first.",details:error.message},{status:503});
 return NextResponse.json({reports:data??[],latest:data?.[0]??null});
}
export async function POST(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const {data:control}=await db.from("operations_controls").select("enabled").eq("owner_id",user.id).eq("control_key","research_automation").maybeSingle();
 if(control?.enabled===false)return NextResponse.json({error:"Research automation is paused in Automation Control."},{status:423});
 const [yt,ig,competitors]=await Promise.all([
  db.from("videos").select("title,description,view_count,published_at,competitor_id").eq("is_niche_relevant",true).order("published_at",{ascending:false}).limit(300),
  db.from("instagram_content_sources").select("caption,source_username,timestamp,like_count,comments_count,permalink").eq("owner_id",user.id).order("timestamp",{ascending:false}).limit(150),
  db.from("competitors").select("id,channel_title,subscriber_count,view_count").eq("owner_id",user.id).eq("is_active",true).eq("ai_production_status","qualified").limit(100)
 ]);
 if(yt.error||ig.error||competitors.error)return NextResponse.json({error:"Could not collect research sources.",details:yt.error?.message??ig.error?.message??competitors.error?.message},{status:500});
 const competitorIds=(competitors.data??[]).map(c=>c.id),channels=competitors.data??[];
 const channelMap=new Map(channels.map(c=>[c.id,c.channel_title]));
 const youtubeVideos:Video[]=(yt.data??[]).filter(v=>competitorIds.includes(v.competitor_id)).map(v=>({...v,platform:"youtube",source_channel_name:channelMap.get(v.competitor_id)??"Tracked creator"}));
 const all=[...youtubeVideos,...(ig.data??[]).map(x=>({title:x.caption??"Instagram post",description:x.caption??"",view_count:0,published_at:x.timestamp,platform:"instagram",source_channel_name:x.source_username}))],topics=rankTopics(all);
 const recent=all.filter(v=>v.published_at&&Date.now()-Date.parse(v.published_at)<=30*86400000);
 const stale=all.filter(v=>v.published_at&&Date.now()-Date.parse(v.published_at)>30*86400000);
 const contentGaps=topics.map(t=>({topic:t.name,signal:t.mentions<3?"Low coverage in saved competitor sample":"Covered by competitors; differentiate with implementation detail",sampleCount:t.mentions,opportunity:t.mentions<3?"Potential coverage gap; validate demand before production":"Build a distinct case study with measurable trade-offs"})).slice(0,7);
 const recommendations=[
  ...topics.slice(0,3).map(t=>"Develop an original "+t.name+" explainer using a real system-design scenario; sampled competitor coverage: "+t.mentions+" items."),
  ...(recent.length<5?["Refresh competitor and Instagram source data; fewer than five sampled items were published in the last 30 days."]:[]),
  "Prioritise topics with both audience relevance and a clear practical demonstration; view counts alone are not proof of demand."
 ].slice(0,6);
 let summary="Analysis of "+all.length+" saved public research items across "+channels.length+" qualified channels. "+recent.length+" sampled items were published in the last 30 days. These counts reflect the saved sample, not the whole market.";
 let generatedBy="rules_based";
 const evidence={sampleSize:all.length,recent30Days:recent.length,olderThan30Days:stale.length,topics:topics.slice(0,7),contentGaps,recommendations};
 const prompt="You are a cautious content intelligence analyst for a practical AI engineering education brand. Analyse this evidence and return JSON {summary:string,recommendations:string[],contentGaps:[{topic:string,reason:string,format:string}]}. Do not invent trends, search volume, facts or causal claims. State that the data is a limited saved competitor sample. Suggest original case-study-first topics. Evidence: "+JSON.stringify(evidence);
 try{
  if(process.env.GEMINI_API_KEY){const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent?key="+process.env.GEMINI_API_KEY,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.25}}),signal:AbortSignal.timeout(18000)});const d=await r.json();if(r.ok){const raw=d.candidates?.[0]?.content?.parts?.map((x:{text?:string})=>x.text??"").join("")??"";const parsed=JSON.parse(raw);if(typeof parsed.summary==="string"){summary=parsed.summary;generatedBy="gemini";if(Array.isArray(parsed.recommendations)&&parsed.recommendations.length)recommendations.splice(0,recommendations.length,...parsed.recommendations.map(String).slice(0,6));if(Array.isArray(parsed.contentGaps)&&parsed.contentGaps.length)contentGaps.splice(0,contentGaps.length,...parsed.contentGaps.slice(0,7));}}}
  if(generatedBy==="rules_based"&&process.env.GROQ_API_KEY){const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+process.env.GROQ_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.GROQ_MODEL||"llama-3.3-70b-versatile",messages:[{role:"user",content:prompt}],temperature:0.25,response_format:{type:"json_object"}}),signal:AbortSignal.timeout(18000)});const d=await r.json();if(r.ok){const parsed=JSON.parse(d.choices?.[0]?.message?.content??"{}");if(typeof parsed.summary==="string"){summary=parsed.summary;generatedBy="groq";if(Array.isArray(parsed.recommendations)&&parsed.recommendations.length)recommendations.splice(0,recommendations.length,...parsed.recommendations.map(String).slice(0,6));if(Array.isArray(parsed.contentGaps)&&parsed.contentGaps.length)contentGaps.splice(0,contentGaps.length,...parsed.contentGaps.slice(0,7));}}}
 }catch{/* Keep source-grounded deterministic report if AI providers fail. */}
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const report={owner_id:user.id,report_date:today,summary,trending_topics:topics.slice(0,7),content_gaps:contentGaps,recommendations,source_counts:{youtube:youtubeVideos.length,instagram:(ig.data??[]).length,qualifiedChannels:channels.length,recent30Days:recent.length},generated_at:new Date().toISOString()};
 const {data:saved,error:saveError}=await db.from("content_intelligence_reports").upsert(report,{onConflict:"owner_id,report_date"}).select("*").single();
 if(saveError)return NextResponse.json({error:"Could not save intelligence report.",details:saveError.message},{status:500});
 await logWorkflowEvent({ownerId:user.id,workflow:"idea_generation",eventKey:"content_intelligence_generated",stage:"research_analysis",status:"completed",message:"Content intelligence report generated from saved competitor and Instagram research.",metadata:{generatedBy,sources:report.source_counts,topics:topics.length}});
 return NextResponse.json({report:saved,generatedBy,sourceCounts:report.source_counts});
}