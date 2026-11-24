import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateResearchJson } from "@/lib/ai/research";
export const runtime="nodejs";export const dynamic="force-dynamic";
const system="You are a YouTube content strategist and senior AI systems engineer for AIWithBh@i. Audience: software engineers, architects and IT professionals. Focus on practical AI system design, LLM architecture, RAG, agents, model serving, production reliability, security, evaluation and enterprise use cases across retail, healthcare, airlines, banking, finance and logistics. Return JSON only: {ideas:[{title,hook,industry,topic,format,language,audience,problem,architectureAngle,outline:[...],differentiation,whyNow,opportunityScore,sourceVideoIds:[...],sourceInstagramIds:[...]}]}. Generate 6-10 original ideas, each citing at least one supplied shortlisted-channel video id. Use only supplied IDs. Never invent reference links or facts. Do not copy competitor titles; create distinct angles. Prefer case-study-first scenario explainers with architecture diagrams and trade-offs. Avoid generic news and shallow listicles. Score niche fit, usefulness, evidence quality, freshness and differentiation. Long videos by default, a few standalone Shorts if useful.";
export async function GET(){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:a}=await s.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const {data:channels,error:ce}=await s.from("competitors").select("id").eq("owner_id",user.id).eq("is_active",true).eq("ai_production_status","qualified");
 if(ce)return NextResponse.json({error:"Could not load active shortlisted channels.",details:ce.message},{status:500});
 const channelIds=(channels??[]).map(x=>x.id);
 if(!channelIds.length)return NextResponse.json({ideas:[],activeSourceVideos:0});
 const {data:videos,error:ve}=await s.from("videos").select("youtube_video_id").eq("owner_id",user.id).eq("is_niche_relevant",true).in("competitor_id",channelIds.length?channelIds:["00000000-0000-0000-0000-000000000000"]);
 if(ve)return NextResponse.json({error:"Could not verify active niche-matched source videos.",details:ve.message},{status:500});
 const activeVideoIds=new Set((videos??[]).map(x=>x.youtube_video_id));
 const {data:connection}=await s.from("instagram_connections").select("instagram_username").eq("owner_id",user.id).maybeSingle();
 const {data:trackedInstagram}=await s.from("manual_tracked_channels").select("url").eq("owner_id",user.id).eq("platform","instagram").eq("is_active",true);
 const activeHandles=new Set<string>([
   ...(connection?.instagram_username?[connection.instagram_username.toLowerCase()]:[]),
   ...(trackedInstagram??[]).map(row=>{try{return new URL(row.url).pathname.split("/").filter(Boolean)[0]?.replace(/^@/,"").toLowerCase()??"";}catch{return "";}}),
 ].filter(Boolean));
 const {data:instagramRows,error:ie}=activeHandles.size
   ? await s.from("instagram_content_sources").select("instagram_media_id,source_username,source_name,permalink,caption,timestamp,media_type,media_product_type,like_count,comments_count").eq("owner_id",user.id).in("source_username",[...activeHandles]).order("timestamp",{ascending:false}).limit(100)
   : {data:[],error:null};
 if(ie)return NextResponse.json({error:"Could not load Instagram research sources.",details:ie.message},{status:500});
 const activeInstagramIds=new Set((instagramRows??[]).map(x=>x.instagram_media_id));
 const {data,error}=await s.from("content_ideas").select("*").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(100);
 if(error)return NextResponse.json({error:"Could not load content opportunities.",details:error.message},{status:500});
 const ideas=(data??[]).filter(idea=>{
   const videoMatch=Array.isArray(idea.source_video_ids)&&idea.source_video_ids.some((id:string)=>activeVideoIds.has(id));
   const refs=Array.isArray(idea.source_references)?idea.source_references as Array<{platform?:string;mediaId?:string}>:[];
   const instagramMatch=refs.some(ref=>ref.platform==="instagram"&&typeof ref.mediaId==="string"&&activeInstagramIds.has(ref.mediaId));
   return videoMatch||instagramMatch;
 }).slice(0,60);
 return NextResponse.json({ideas,activeSourceVideos:activeVideoIds.size,activeInstagramPosts:activeInstagramIds.size});
}
export async function POST(){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});const {data:{user},error:a}=await s.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const {data:channels,error:ce}=await s.from("competitors").select("id,channel_title,channel_url").eq("owner_id",user.id).eq("is_active",true).eq("ai_production_status","qualified").limit(100);if(ce)return NextResponse.json({error:"Could not load shortlisted channels.",details:ce.message},{status:500});const ids=(channels??[]).map(x=>x.id);if(!ids.length)return NextResponse.json({error:"No active qualified channels are shortlisted. Qualify channels in Creator Explorer first."},{status:409});
 const {data:rows,error:ve}=await s.from("videos").select("youtube_video_id,title,description,published_at,view_count,video_url,competitor_id").in("competitor_id",ids).eq("is_niche_relevant",true).order("published_at",{ascending:false}).limit(100);if(ve)return NextResponse.json({error:"Could not load reference videos.",details:ve.message},{status:500});if(!rows?.length)return NextResponse.json({error:"No niche-matched videos from active shortlisted channels. Run Video Explorer refresh first, then retry."},{status:409});
 const cmap=new Map((channels??[]).map(x=>[x.id,x]));const videos=rows.map(v=>({videoId:v.youtube_video_id,title:v.title,description:(v.description??"").slice(0,700),publishedAt:v.published_at,views:v.view_count,url:v.video_url??("https://www.youtube.com/watch?v="+v.youtube_video_id),channel:cmap.get(v.competitor_id)?.channel_title??"Shortlisted channel",channelUrl:cmap.get(v.competitor_id)?.channel_url??null}));
 const {data:connection}=await s.from("instagram_connections").select("instagram_username").eq("owner_id",user.id).maybeSingle();
 const {data:trackedInstagram,error:trackedError}=await s.from("manual_tracked_channels").select("url").eq("owner_id",user.id).eq("platform","instagram").eq("is_active",true);
 if(trackedError)return NextResponse.json({error:"Could not load active Instagram shortlist.",details:trackedError.message},{status:500});
 const activeHandles=new Set<string>([
   ...(connection?.instagram_username?[connection.instagram_username.toLowerCase()]:[]),
   ...(trackedInstagram??[]).map(row=>{try{return new URL(row.url).pathname.split("/").filter(Boolean)[0]?.replace(/^@/,"").toLowerCase()??"";}catch{return "";}}),
 ].filter(Boolean));
 const {data:instagramRows,error:instagramError}=activeHandles.size
   ? await s.from("instagram_content_sources").select("instagram_media_id,source_username,source_name,permalink,caption,timestamp,media_type,media_product_type,like_count,comments_count").eq("owner_id",user.id).in("source_username",[...activeHandles]).order("timestamp",{ascending:false}).limit(80)
   : {data:[],error:null};
 if(instagramError)return NextResponse.json({error:"Could not load Instagram research posts.",details:instagramError.message},{status:500});
 const instagramPosts=(instagramRows??[]).map(post=>({mediaId:post.instagram_media_id,username:post.source_username,title:(post.caption??"").slice(0,180)||("Instagram "+(post.media_product_type??post.media_type??"post")+" by @"+post.source_username),caption:(post.caption??"").slice(0,900),url:post.permalink,publishedAt:post.timestamp,mediaType:post.media_type,productType:post.media_product_type,likes:post.like_count,comments:post.comments_count}));
 const {data:trends}=await s.from("architecture_trends").select("title,industry,pattern,business_problem,architecture_flow,evidence_note").eq("owner_id",user.id).order("updated_at",{ascending:false}).limit(30);const {data:existing}=await s.from("content_ideas").select("title").eq("owner_id",user.id).limit(100);
 try{const result=await generateResearchJson(system,JSON.stringify({channel:"AIWithBh@i",targetAudience:"IT professionals and software engineers",architectureTrends:trends??[],shortlistedChannels:channels,shortlistedChannelVideos:videos,instagramShortlistPosts:instagramPosts,avoidRepeating:(existing??[]).map(x=>x.title)}));const raw=result.data as {ideas?:Array<Record<string,unknown>>};const valid=new Set(videos.map(v=>v.videoId));const validInstagram=new Set(instagramPosts.map(post=>post.mediaId));
 const ideas=(Array.isArray(raw.ideas)?raw.ideas:[]).slice(0,10).map(item=>{
   const sourceIds=Array.isArray(item.sourceVideoIds)?[...new Set(item.sourceVideoIds.filter((id):id is string=>typeof id==="string"&&valid.has(id)))]:[];
   const sourceInstagramIds=Array.isArray(item.sourceInstagramIds)?[...new Set(item.sourceInstagramIds.filter((id):id is string=>typeof id==="string"&&validInstagram.has(id)))]:[];
   const references=[
     ...videos.filter(v=>sourceIds.includes(v.videoId)).map(v=>({...v,platform:"youtube"})),
     ...instagramPosts.filter(post=>sourceInstagramIds.includes(post.mediaId)).map(post=>({platform:"instagram",mediaId:post.mediaId,title:post.title,channel:"@"+post.username,username:post.username,url:post.url,publishedAt:post.publishedAt,views:null,caption:post.caption,mediaType:post.mediaType,likes:post.likes,comments:post.comments})),
   ];
   const title=String(item.title??"").trim().slice(0,220);const key=title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,180);
   return {owner_id:user.id,title,hook:String(item.hook??"").slice(0,700),outline:Array.isArray(item.outline)?item.outline.slice(0,12):[],format:item.format==="short"?"short":"long",language:item.language==="hi"?"hi":"en",topic:String(item.topic??item.industry??"AI system design").slice(0,180),opportunity_score:Math.max(0,Math.min(100,Number(item.opportunityScore)||0)),source_video_ids:sourceIds,source_references:references,idea_key:key,status:"idea"};
 }).filter(x=>x.title&&(x.source_video_ids.length>0||x.source_references.some(ref=>ref.platform==="instagram"))&&x.idea_key);
 if(!ideas.length)return NextResponse.json({error:"AI did not produce ideas with valid shortlisted-video references. Refresh competitor videos and retry."},{status:502});const {data:saved,error}=await s.from("content_ideas").upsert(ideas,{onConflict:"owner_id,idea_key",ignoreDuplicates:true}).select("*");if(error)return NextResponse.json({error:"Could not save opportunities. Apply the research migration first.",details:error.message},{status:500});const {data:all}=await s.from("content_ideas").select("*").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(100);const visibleIdeas=(all??[]).filter(idea=>(Array.isArray(idea.source_video_ids)&&idea.source_video_ids.some((id:string)=>valid.has(id)))||(Array.isArray(idea.source_references)&&idea.source_references.some((ref:{platform?:string;mediaId?:string})=>ref.platform==="instagram"&&typeof ref.mediaId==="string"&&validInstagram.has(ref.mediaId)))).slice(0,60);return NextResponse.json({ideas:visibleIdeas.length?visibleIdeas:saved??[],generated:ideas.length,newlySaved:saved?.length??0,provider:result.provider,fallbackUsed:result.fallbackUsed,referenceVideosUsed:videos.length,instagramPostsUsed:instagramPosts.length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Opportunity generation failed."},{status:502});}
}
export async function PATCH(request:Request){const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});const {data:{user},error:a}=await s.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});let body:{id?:unknown;status?:unknown};try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}const allowed=["idea","planned","approved","producing","published","rejected"];if(typeof body.id!=="string"||typeof body.status!=="string"||!allowed.includes(body.status))return NextResponse.json({error:"Provide a valid idea id and status."},{status:400});const {data,error}=await s.from("content_ideas").update({status:body.status}).eq("id",body.id).eq("owner_id",user.id).select("*").maybeSingle();if(error)return NextResponse.json({error:"Could not update status.",details:error.message},{status:500});if(!data)return NextResponse.json({error:"Idea not found."},{status:404});return NextResponse.json({idea:data});}