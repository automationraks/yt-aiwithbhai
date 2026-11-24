import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/auth/session";
import { generateResearchJson } from "@/lib/ai/research";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=60;
const system=`You are AIWithBh@i's senior AI systems research strategist. Audience: software engineers, architects and IT professionals. Return JSON only: {ideas:[{title,hook,topic,industry,outline:string[],opportunityScore:number,sourceVideoIds:string[],scriptPackage:{complexity:"simple"|"medium"|"complex",estimatedDurationSeconds:number,script:string,voiceover:string,scenes:[{startSeconds:number,endSeconds:number,visualPrompt:string,onScreenText:string}],instagramCaption:string,hashtags:string[],youtubeTitle:string,youtubeDescription:string,videoStyle:string}}]}. Create 6 original case-study-first ideas grounded in supplied video IDs only. Do not copy titles or invent facts/metrics. Every idea needs a complete 30-60 second English vertical short narration, strong 2-second hook, useful technical explanation and ending. Simple 30-40s, medium 40-50s, complex 50-60s. Voiceover must exactly equal script. Scene timings sequentially cover the video in segments no longer than 7 seconds. No spoken content outside the approved narration.`;
export async function POST(request:Request){
 const secret=process.env.CRON_SECRET;if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const ownerId=process.env.AUTOMATION_OWNER_ID;if(!ownerId)return NextResponse.json({error:"AUTOMATION_OWNER_ID is not configured"},{status:503});
 const db=createSupabaseAdminClient();
 const {data:channels,error:ce}=await db.from("competitors").select("id,channel_title,channel_url").eq("owner_id",ownerId).eq("is_active",true).eq("ai_production_status","qualified").limit(100);
 if(ce)return NextResponse.json({error:ce.message},{status:500});const ids=(channels??[]).map(x=>x.id);if(!ids.length)return NextResponse.json({error:"No qualified competitor channels. Qualify channels in Creator Explorer first."},{status:409});
 const {data:videos,error:ve}=await db.from("videos").select("youtube_video_id,title,description,published_at,view_count,video_url,competitor_id").eq("owner_id",ownerId).eq("is_niche_relevant",true).in("competitor_id",ids).order("published_at",{ascending:false}).limit(100);
 if(ve)return NextResponse.json({error:ve.message},{status:500});if(!videos?.length)return NextResponse.json({error:"No niche-matched videos. Refresh competitor videos first."},{status:409});
 const {data:trends}=await db.from("architecture_trends").select("title,industry,pattern,business_problem,architecture_flow,evidence_note").eq("owner_id",ownerId).order("updated_at",{ascending:false}).limit(25);
 const {data:old}=await db.from("content_ideas").select("title").eq("owner_id",ownerId).limit(100);
 const channelMap=new Map((channels??[]).map(x=>[x.id,x.channel_title]));
 const sources=videos.map(v=>({videoId:v.youtube_video_id,title:v.title,description:(v.description??"").slice(0,500),publishedAt:v.published_at,views:v.view_count,url:v.video_url??"https://www.youtube.com/watch?v="+v.youtube_video_id,channel:channelMap.get(v.competitor_id)??"Qualified channel"}));
 try{
  const result=await generateResearchJson(system,JSON.stringify({brand:"AIWithBh@i",timezone:"Asia/Kolkata",audience:"IT professionals and software engineers",architectureTrends:trends??[],sourceVideos:sources,avoidRepeating:(old??[]).map(x=>x.title)}));
  const raw=result.data as {ideas?:Array<Record<string,any>>};const valid=new Set(sources.map(x=>x.videoId));
  const prepared=(Array.isArray(raw.ideas)?raw.ideas:[]).slice(0,10).map(item=>{
   const p=item.scriptPackage&&typeof item.scriptPackage==="object"?item.scriptPackage:{};
   const title=String(item.title??"").trim().slice(0,220),voice=String(p.voiceover??p.script??"").trim();
   const complexity=p.complexity==="complex"?"complex":p.complexity==="medium"?"medium":"simple";
   const d=Number(p.estimatedDurationSeconds),duration=Number.isFinite(d)?Math.max(30,Math.min(60,Math.round(d))):(complexity==="complex"?55:complexity==="medium"?45:35);
   const refs=Array.isArray(item.sourceVideoIds)?[...new Set(item.sourceVideoIds.filter((x:unknown):x is string=>typeof x==="string"&&valid.has(x)))]:[];
   const scenes=(Array.isArray(p.scenes)?p.scenes:[]).slice(0,16).map((s:any)=>({startSeconds:Number(s.startSeconds)||0,endSeconds:Number(s.endSeconds)||0,visualPrompt:String(s.visualPrompt??""),onScreenText:String(s.onScreenText??"")}));
   const key=title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,170);
   return {owner_id:ownerId,title,hook:String(item.hook??"").slice(0,700),outline:Array.isArray(item.outline)?item.outline.slice(0,12):[],format:"short",language:"en",topic:String(item.topic??item.industry??"AI engineering").slice(0,180),opportunity_score:Math.max(0,Math.min(100,Number(item.opportunityScore)||0)),source_video_ids:refs,source_references:sources.filter(s=>refs.includes(s.videoId)).map(s=>({...s,platform:"youtube"})),idea_key:key,status:"idea",script_package:{complexity,estimatedDurationSeconds:duration,script:voice,voiceover:voice,scenes,instagramCaption:String(p.instagramCaption??""),hashtags:Array.isArray(p.hashtags)?p.hashtags.filter((x:unknown)=>typeof x==="string").slice(0,15):[],youtubeTitle:String(p.youtubeTitle??title),youtubeDescription:String(p.youtubeDescription??""),videoStyle:String(p.videoStyle??"Vertical 9:16 technical motion graphics")},target_duration_seconds:duration,video_production_status:"not_started"};
  }).filter(x=>x.title&&x.idea_key&&x.source_video_ids.length&&x.script_package.voiceover.length>40&&x.script_package.scenes.length);
  if(!prepared.length)return NextResponse.json({error:"AI returned no valid source-backed video packages"},{status:502});
  const {data:saved,error}=await db.from("content_ideas").upsert(prepared,{onConflict:"owner_id,idea_key",ignoreDuplicates:true}).select("id,title");
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true,generated:prepared.length,newlySaved:saved?.length??0,provider:result.provider,fallbackUsed:result.fallbackUsed,sourceVideosUsed:sources.length,timezone:"Asia/Kolkata"});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Research failed"},{status:502});}
}
