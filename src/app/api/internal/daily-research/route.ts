import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/auth/session";
import { generateResearchJson } from "@/lib/ai/research";
import { logWorkflowEvent } from "@/lib/workflow-events";
export const runtime="nodejs"; export const dynamic="force-dynamic"; export const maxDuration=60;
type ResearchScene = { startSeconds?: unknown; endSeconds?: unknown; visualPrompt?: unknown; onScreenText?: unknown };
type ResearchIdea = {
 title?: unknown; hook?: unknown; topic?: unknown; industry?: unknown; outline?: unknown;
 opportunityScore?: unknown; sourceVideoIds?: unknown; sourceInstagramIds?: unknown;
 scriptPackage?: {
  complexity?: unknown; estimatedDurationSeconds?: unknown; script?: unknown; voiceover?: unknown;
  scenes?: unknown; instagramCaption?: unknown; hashtags?: unknown; youtubeTitle?: unknown;
  youtubeDescription?: unknown; videoStyle?: unknown;
 };
};
type InstagramReference = { platform: "instagram"; mediaId: string; title: string; channel: string; username: string; url: string; publishedAt: string | null; views: null; caption: string; mediaType: string | null; productType: string | null; likes: number | null; comments: number | null };
const system=`You are AIWithBh@i's senior AI systems research strategist. Audience: software engineers, architects and IT professionals. Return JSON only: {ideas:[{title,hook,topic,industry,outline:string[],opportunityScore:number,sourceVideoIds:string[],scriptPackage:{complexity:"simple"|"medium"|"complex",estimatedDurationSeconds:number,script:string,voiceover:string,scenes:[{startSeconds:number,endSeconds:number,visualPrompt:string,onScreenText:string}],instagramCaption:string,hashtags:string[],youtubeTitle:string,youtubeDescription:string,videoStyle:string}}]}. Create 6 original case-study-first ideas grounded only in supplied YouTube video IDs and Instagram media IDs. Do not copy titles or invent facts/metrics. Every idea needs a complete 30-60 second English vertical short narration, strong 2-second hook, useful technical explanation and ending. Simple 30-40s, medium 40-50s, complex 50-60s. Voiceover must exactly equal script. Scene timings sequentially cover the video in segments no longer than 7 seconds. No spoken content outside the approved narration.`;
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
 const {data:connection}=await db.from("instagram_connections").select("instagram_username").eq("owner_id",ownerId).maybeSingle();
 const {data:tracked}=await db.from("manual_tracked_channels").select("url").eq("owner_id",ownerId).eq("platform","instagram").eq("is_active",true);
 const handles=new Set<string>([
  ...(connection?.instagram_username?[connection.instagram_username.toLowerCase()]:[]),
  ...(tracked??[]).map(row=>{try{const part=new URL(row.url).pathname.split("/").filter(Boolean)[0]??"";return ["p","reel","reels","tv","stories","explore"].includes(part.toLowerCase())?"":part.replace(/^@/,"").toLowerCase();}catch{return "";}})
 ].filter(Boolean));
 const {data:instagramRows,error:instagramError}=handles.size?await db.from("instagram_content_sources").select("instagram_media_id,source_username,source_name,permalink,caption,timestamp,media_type,media_product_type,like_count,comments_count").eq("owner_id",ownerId).in("source_username",[...handles]).order("timestamp",{ascending:false}).limit(80):{data:[],error:null};
 if(instagramError)return NextResponse.json({error:instagramError.message},{status:500});
 const instagramPosts:InstagramReference[]=(instagramRows??[]).map(p=>({platform:"instagram",mediaId:p.instagram_media_id,username:p.source_username,channel:"@"+p.source_username,views:null,title:(p.caption??"").slice(0,160)||("Instagram post by @"+p.source_username),caption:(p.caption??"").slice(0,800),url:p.permalink,publishedAt:p.timestamp,mediaType:p.media_type,productType:p.media_product_type,likes:p.like_count,comments:p.comments_count}));
 const channelMap=new Map((channels??[]).map(x=>[x.id,x.channel_title]));
 const sources=videos.map(v=>({videoId:v.youtube_video_id,title:v.title,description:(v.description??"").slice(0,500),publishedAt:v.published_at,views:v.view_count,url:v.video_url??"https://www.youtube.com/watch?v="+v.youtube_video_id,channel:channelMap.get(v.competitor_id)??"Qualified channel"}));
 try{
  const result=await generateResearchJson(system,JSON.stringify({brand:"AIWithBh@i",timezone:"Asia/Kolkata",audience:"IT professionals and software engineers",architectureTrends:trends??[],sourceVideos:sources,instagramResearchPosts:instagramPosts,avoidRepeating:(old??[]).map(x=>x.title)}));
  const raw=result.data as {ideas?:ResearchIdea[]};const valid=new Set(sources.map(x=>x.videoId)),validInstagram=new Set(instagramPosts.map(x=>x.mediaId));
  const prepared=(Array.isArray(raw.ideas)?raw.ideas:[]).slice(0,10).map(item=>{
   const p=item.scriptPackage&&typeof item.scriptPackage==="object"?item.scriptPackage:{};
   const title=String(item.title??"").trim().slice(0,220),voice=String(p.voiceover??p.script??"").trim();
   const complexity=p.complexity==="complex"?"complex":p.complexity==="medium"?"medium":"simple";
   const d=Number(p.estimatedDurationSeconds),duration=Number.isFinite(d)?Math.max(30,Math.min(60,Math.round(d))):(complexity==="complex"?55:complexity==="medium"?45:35);
   const refs=Array.isArray(item.sourceVideoIds)?[...new Set(item.sourceVideoIds.filter((x:unknown):x is string=>typeof x==="string"&&valid.has(x)))]:[];
   const instagramIds=Array.isArray(item.sourceInstagramIds)?[...new Set(item.sourceInstagramIds.filter((x:unknown):x is string=>typeof x==="string"&&validInstagram.has(x)))]:[];
   const scenes=(Array.isArray(p.scenes)?p.scenes:[]).slice(0,16).map((scene:unknown): {startSeconds:number;endSeconds:number;visualPrompt:string;onScreenText:string}=>{const s=(scene&&typeof scene==="object"?scene:{}) as ResearchScene;return {startSeconds:Number(s.startSeconds)||0,endSeconds:Number(s.endSeconds)||0,visualPrompt:String(s.visualPrompt??""),onScreenText:String(s.onScreenText??"")};});
   const key=title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,170);
   return {owner_id:ownerId,title,hook:String(item.hook??"").slice(0,700),outline:Array.isArray(item.outline)?item.outline.slice(0,12):[],format:"short",language:"en",topic:String(item.topic??item.industry??"AI engineering").slice(0,180),opportunity_score:Math.max(0,Math.min(100,Number(item.opportunityScore)||0)),source_video_ids:refs,source_references:[...sources.filter(s=>refs.includes(s.videoId)).map(s=>({...s,platform:"youtube"})),...instagramPosts.filter(p=>instagramIds.includes(p.mediaId)).map(p=>({platform:"instagram",mediaId:p.mediaId,title:p.title,channel:"@"+p.username,username:p.username,url:p.url,publishedAt:p.publishedAt,views:null,caption:p.caption,mediaType:p.mediaType,likes:p.likes,comments:p.comments}))],idea_key:key,status:"idea",script_package:{complexity,estimatedDurationSeconds:duration,script:voice,voiceover:voice,scenes,instagramCaption:String(p.instagramCaption??""),hashtags:Array.isArray(p.hashtags)?p.hashtags.filter((x:unknown)=>typeof x==="string").slice(0,15):[],youtubeTitle:String(p.youtubeTitle??title),youtubeDescription:String(p.youtubeDescription??""),videoStyle:String(p.videoStyle??"Vertical 9:16 technical motion graphics")},target_duration_seconds:duration,video_production_status:"not_started"};
  }).filter(x=>x.title&&x.idea_key&&(x.source_video_ids.length>0||x.source_references.some(r=>r.platform==="instagram"))&&x.script_package.voiceover.length>40&&x.script_package.scenes.length);
  if(!prepared.length)return NextResponse.json({error:"AI returned no valid source-backed video packages"},{status:502});
  const {data:saved,error}=await db.from("content_ideas").upsert(prepared,{onConflict:"owner_id,idea_key",ignoreDuplicates:true}).select("id,title");
  if(error){await logWorkflowEvent({ownerId,workflow:"idea_generation",eventKey:"generation_save_failed",stage:"save_ideas",status:"failed",message:"Generated ideas could not be saved.",metadata:{error:error.message}});return NextResponse.json({error:error.message},{status:500});}
  await logWorkflowEvent({ownerId,workflow:"idea_generation",eventKey:"generation_completed",stage:"generation_completed",status:"completed",message:"Daily research generated and saved video idea packages.",metadata:{generated:prepared.length,newlySaved:saved?.length??0,provider:result.provider,fallbackUsed:result.fallbackUsed,youtubeSources:sources.length,instagramSources:instagramPosts.length}});
  return NextResponse.json({ok:true,generated:prepared.length,newlySaved:saved?.length??0,provider:result.provider,fallbackUsed:result.fallbackUsed,sourceVideosUsed:sources.length,instagramPostsUsed:instagramPosts.length,timezone:"Asia/Kolkata"});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Research failed"},{status:502});}
}
