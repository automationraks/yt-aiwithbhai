import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateResearchJson } from "@/lib/ai/research";
import { getActiveWorkspace } from "@/lib/workspaces/context";
export const runtime="nodejs";export const dynamic="force-dynamic";
type GeneratedContent={
 researchConfidence?:number;scriptConfidence?:number;sourceReferences?:Array<Record<string,unknown>>;
 contentGap?:string;differentiation?:string;outline?:Array<Record<string,unknown>>;hook?:string;
 script?:string;curiosityLoops?:unknown[];
};
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:a}=await s.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const ws=await getActiveWorkspace(s,user.id);if(!ws)return NextResponse.json({error:"Create a workspace first."},{status:409});
 const {data:item,error:ie}=await s.from("content_calendar").select("*").eq("id",id).eq("owner_id",user.id).eq("workspace_id",ws.id).single();if(ie||!item)return NextResponse.json({error:"Calendar item not found."},{status:404});
 const {data:channels,error:ce}=await s.from("competitors").select("id,channel_title,channel_url").eq("owner_id",user.id).eq("workspace_id",ws.id).eq("is_active",true).eq("ai_production_status","qualified").limit(100);if(ce)return NextResponse.json({error:"Could not load approved research channels.",details:ce.message},{status:500});
 const channelIds=(channels??[]).map(x=>x.id);
 const {data:videos,error:ve}=channelIds.length?await s.from("videos").select("youtube_video_id,title,description,published_at,view_count,video_url,competitor_id").eq("owner_id",user.id).eq("is_niche_relevant",true).in("competitor_id",channelIds).order("published_at",{ascending:false}).limit(60):{data:[],error:null};
 if(ve)return NextResponse.json({error:"Could not load research videos.",details:ve.message},{status:500});
 const {data:trends,error:te}=await s.from("architecture_trends").select("title,industry,pattern,business_problem,architecture_flow,design_considerations,tradeoffs,source_links,confidence_score,evidence_note").eq("owner_id",user.id).order("updated_at",{ascending:false}).limit(25);if(te)return NextResponse.json({error:"Could not load architecture trends.",details:te.message},{status:500});
 const {data:ideas}=await s.from("content_ideas").select("title,hook,outline,opportunity_score,source_references").eq("owner_id",user.id).eq("channel_workspace_id",ws.id).order("created_at",{ascending:false}).limit(40);
 const refs=(videos??[]).map(v=>({videoId:v.youtube_video_id,title:v.title,description:(v.description??"").slice(0,500),url:v.video_url??("https://youtube.com/watch?v="+v.youtube_video_id),publishedAt:v.published_at,views:v.view_count,channel:(channels??[]).find(c=>c.id===v.competitor_id)?.channel_title??"Approved channel"}));
 const system=`You are the research editor and high-retention YouTube Shorts writer for AIWithBh@i. Audience: software engineers and IT professionals. Create ONLY a 50-60 second short, target 55 seconds, approximately 115-145 spoken words. Research must be evidence-grounded. Return JSON: {researchConfidence:0-100,scriptConfidence:0-100,researchSummary:"",keyFacts:[...],sourceReferences:[{title,url,sourceType}],contentGap:"",differentiation:"",outline:[{time:"0-3s",purpose:"",visual:"",narration:""}],hook:"",script:"",curiosityLoops:[...],endingPayoff:"",estimatedDurationSeconds:55}. Confidence means evidence quality and script-to-brief alignment, not a guarantee of performance. Only assign scores above 80 when sources directly support the key claims and the story is coherent; otherwise return lower scores and explain missing evidence. Script structure: 0-3s pattern-breaking hook with a concrete tension; 3-10s establish stakes and open a question; 10-40s deliver escalating useful steps while opening and closing curiosity loops; 40-52s reveal payoff/trade-off; 52-60s concise takeaway/CTA. No slow intro, generic greetings, filler, fake statistics, unsupported claims or copied competitor wording. Use a single clear narrative, spoken natural language, visual changes every 2-4 seconds, and make the ending resolve the opening question. If evidence is insufficient, do not fabricate: score below 81.`;
 try{
  const result=await generateResearchJson(system,JSON.stringify({topic:item.title,targetDurationSeconds:55,activeQualifiedCompetitorVideos:refs,architectureTrends:trends??[],existingContentOpportunities:ideas??[],instruction:"Use supplied research only. Cite exact supplied URLs. Do not imply competitor views prove audience demand."}));
  const d=result.data as GeneratedContent;const researchScore=Math.max(0,Math.min(100,Number(d.researchConfidence)||0));const scriptScore=Math.max(0,Math.min(100,Number(d.scriptConfidence)||0));
  const brief={owner_id:user.id,calendar_id:id,research_snapshot:{topic:item.title,competitorVideos:refs,trends:trends??[],opportunities:ideas??[]},source_references:Array.isArray(d.sourceReferences)?d.sourceReferences:[],competitor_insights:refs.slice(0,20),trend_insights:trends??[],content_gaps:[d.contentGap??""],differentiation_strategy:String(d.differentiation??""),confidence_score:researchScore};
  const {error:be}=await s.from("content_research_briefs").insert(brief);if(be)throw new Error("Could not save research brief: "+be.message);
  if(researchScore<81||scriptScore<81){await s.from("content_calendar").update({status:"research_ready",research_confidence:researchScore,script_confidence:scriptScore}).eq("id",id).eq("owner_id",user.id);return NextResponse.json({accepted:false,researchConfidence:researchScore,scriptConfidence:scriptScore,reason:"Confidence must exceed 80%. Improve or refresh the research before script approval.",brief});}
  const script=String(d.script??"").trim();const outline=Array.isArray(d.outline)?d.outline:[];
  const words=script.split(/\s+/).filter(Boolean).length;const duration=Math.round(words/2.35*60);
  if(!script||duration<45||duration>65||outline.length<5)throw new Error("Generated script failed the 50-60 second structure validation. Regenerate with stronger pacing.");
  const {data:latest}=await s.from("content_scripts").select("version").eq("calendar_id",id).order("version",{ascending:false}).limit(1).maybeSingle();
  const {data:saved,error:se}=await s.from("content_scripts").insert({owner_id:user.id,calendar_id:id,version:(latest?.version??0)+1,outline,script,hook:String(d.hook??""),curiosity_loops:Array.isArray(d.curiosityLoops)?d.curiosityLoops:[],word_count:words,estimated_duration_seconds:duration,quality_confidence:scriptScore,provider:result.provider,status:"draft"}).select("*").single();
  if(se)throw new Error("Could not save script: "+se.message);
  await s.from("content_calendar").update({status:"script_ready",research_confidence:researchScore,script_confidence:scriptScore}).eq("id",id).eq("owner_id",user.id);
  return NextResponse.json({accepted:true,brief,script:saved,provider:result.provider,fallbackUsed:result.fallbackUsed});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Research and script generation failed."},{status:502});}
}
