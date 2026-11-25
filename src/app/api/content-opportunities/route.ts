import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateResearchJson } from "@/lib/ai/research";
import { logWorkflowEvent } from "@/lib/workflow-events";
export const runtime="nodejs";export const dynamic="force-dynamic";
const system = `You are a YouTube content strategist and senior AI systems engineer for AIWithBh@i. Audience: software engineers, architects and IT professionals. Focus on practical AI system design, LLM architecture, RAG, agents, model serving, production reliability, security, evaluation and enterprise use cases across retail, healthcare, airlines, banking, finance and logistics. Return JSON only: {ideas:[{title,hook,industry,topic,format,language,audience,problem,architectureAngle,outline:[...],differentiation,whyNow,opportunityScore,sourceVideoIds:[...],sourceInstagramIds:[...],scriptPackage:{complexity,estimatedDurationSeconds,script,voiceover,scenes:[{startSeconds,endSeconds,visualPrompt,onScreenText}],instagramCaption,hashtags,youtubeTitle,youtubeDescription,videoStyle}}]}. Generate 6-10 original ideas, each citing at least one supplied YouTube video or Instagram post when relevant. Prefer using both platforms when both provide useful evidence. Use only supplied IDs. Never invent reference links or facts. Do not copy competitor titles; create distinct angles. Prefer case-study-first scenario explainers with architecture diagrams and trade-offs. Avoid generic news and shallow listicles. Score niche fit, usefulness, evidence quality, freshness and differentiation. Every idea must include a complete ready-to-produce vertical short package in scriptPackage: {complexity:"simple|medium|complex",estimatedDurationSeconds:integer,script:string,voiceover:string,scenes:[{startSeconds:number,endSeconds:number,visualPrompt:string,onScreenText:string}],instagramCaption:string,hashtags:string[],youtubeTitle:string,youtubeDescription:string,videoStyle:string}. The estimated duration must be 30-60 seconds: simple 30-40, medium 40-50, complex 50-60. Write narration at a natural pace that fits the selected duration; do not pad. Use a strong first 2-second hook, accurate facts, original scene prompts and a clear ending. Produce a single 9:16 video concept suitable for both YouTube Shorts and Instagram Reels. Long videos are not required.`;
export async function GET(){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:a}=await s.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 // Historical opportunities must remain visible even when their source channels/posts
 // are later removed from the active shortlist or refreshed out of the current source set.
 const {data,error}=await s.from("content_ideas").select("*").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(100);
 if(error)return NextResponse.json({error:"Could not load content opportunities.",details:error.message},{status:500});
 return NextResponse.json({ideas:data??[]});
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
   const pkg=(item.scriptPackage&&typeof item.scriptPackage==="object"?item.scriptPackage:{}) as Record<string,unknown>;
   const complexity=pkg.complexity==="complex"?"complex":pkg.complexity==="medium"?"medium":"simple";
   const fallbackDuration=complexity==="complex"?55:complexity==="medium"?45:35;
   const requestedDuration=Number(pkg.estimatedDurationSeconds);
   const duration=Number.isFinite(requestedDuration)?Math.max(30,Math.min(60,Math.round(requestedDuration))):fallbackDuration;
   const scriptPackage={complexity,estimatedDurationSeconds:duration,script:String(pkg.script??""),voiceover:String(pkg.voiceover??pkg.script??""),scenes:Array.isArray(pkg.scenes)?pkg.scenes.slice(0,16):[],instagramCaption:String(pkg.instagramCaption??""),hashtags:Array.isArray(pkg.hashtags)?pkg.hashtags.filter((x):x is string=>typeof x==="string").slice(0,15):[],youtubeTitle:String(pkg.youtubeTitle??title),youtubeDescription:String(pkg.youtubeDescription??""),videoStyle:String(pkg.videoStyle??"Vertical 9:16, clean technical motion graphics, readable subtitles, crisp HD visuals")};
   return {owner_id:user.id,title,hook:String(item.hook??"").slice(0,700),outline:Array.isArray(item.outline)?item.outline.slice(0,12):[],format:"short",language:item.language==="hi"?"hi":"en",topic:String(item.topic??item.industry??"AI system design").slice(0,180),opportunity_score:Math.max(0,Math.min(100,Number(item.opportunityScore)||0)),source_video_ids:sourceIds,source_references:references,idea_key:key,status:"idea",script_package:scriptPackage,target_duration_seconds:duration,video_production_status:"not_started"};
 }).filter(x=>x.title&&(x.source_video_ids.length>0||x.source_references.some(ref=>ref.platform==="instagram"))&&x.idea_key&&x.script_package.script.trim().length>0&&x.script_package.scenes.length>0);
 if(!ideas.length)return NextResponse.json({error:"AI did not produce ideas with valid shortlisted-video references. Refresh competitor videos and retry."},{status:502});const {data:saved,error}=await s.from("content_ideas").upsert(ideas,{onConflict:"owner_id,idea_key",ignoreDuplicates:true}).select("*");if(error)return NextResponse.json({error:"Could not save opportunities. Apply the research migration first.",details:error.message},{status:500});const {data:all}=await s.from("content_ideas").select("*").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(100);const visibleIdeas=(all??[]).filter(idea=>(Array.isArray(idea.source_video_ids)&&idea.source_video_ids.some((id:string)=>valid.has(id)))||(Array.isArray(idea.source_references)&&idea.source_references.some((ref:{platform?:string;mediaId?:string})=>ref.platform==="instagram"&&typeof ref.mediaId==="string"&&validInstagram.has(ref.mediaId)))).slice(0,60);await logWorkflowEvent({ownerId:user.id,workflow:"idea_generation",eventKey:"generation_completed",stage:"generation_completed",status:"completed",message:"Manual content-opportunity research generated video idea packages.",metadata:{generated:ideas.length,newlySaved:saved?.length??0,provider:result.provider,fallbackUsed:result.fallbackUsed,youtubeSources:videos.length,instagramSources:instagramPosts.length}});return NextResponse.json({ideas:visibleIdeas.length?visibleIdeas:saved??[],generated:ideas.length,newlySaved:saved?.length??0,provider:result.provider,fallbackUsed:result.fallbackUsed,referenceVideosUsed:videos.length,instagramPostsUsed:instagramPosts.length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Opportunity generation failed."},{status:502});}
}
export async function PATCH(request:Request){
 const s=await createSupabaseServerClient();
 if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:a}=await s.auth.getUser();
 if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 let body:{id?:unknown;status?:unknown};
 try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 const allowed=["idea","planned","approved","producing","published","rejected"];
 if(typeof body.id!=="string"||typeof body.status!=="string"||!allowed.includes(body.status))
   return NextResponse.json({error:"Provide a valid idea id and status."},{status:400});
 const {data:existing,error:readError}=await s.from("content_ideas").select("*").eq("id",body.id).eq("owner_id",user.id).maybeSingle();
 if(readError)return NextResponse.json({error:"Could not load idea.",details:readError.message},{status:500});
 if(!existing)return NextResponse.json({error:"Idea not found."},{status:404});
 if(body.status==="approved"){
   if(existing.status==="approved"||["queued","processing","ready"].includes(String(existing.video_production_status)))
     return NextResponse.json({error:"This idea has already been approved or queued."},{status:409});
   const webhook=process.env.N8N_VIDEO_PRODUCTION_WEBHOOK_URL;
   const approvedScript=String(existing.script_package?.voiceover||existing.script_package?.script||"").trim();
   if(!approvedScript)return NextResponse.json({error:"This idea has no approved narration. Regenerate its script package before approval."},{status:422});
   if(!webhook)return NextResponse.json({error:"Video production is not configured. Add N8N_VIDEO_PRODUCTION_WEBHOOK_URL in Vercel."},{status:503});
   const {createHash}=await import("node:crypto");
   const scriptHash=createHash("sha256").update(approvedScript,"utf8").digest("hex");
   const duration=Math.max(30,Math.min(60,Number(existing.target_duration_seconds)||35));
   const words=approvedScript.split(/\s+/).filter(Boolean);
   const segmentCount=Math.ceil(duration/7);
   const scenes=Array.isArray(existing.script_package?.scenes)?existing.script_package.scenes:[];
   const segments=Array.from({length:segmentCount},(_,index)=>{
     const startSeconds=index*7;
     const endSeconds=Math.min(duration,(index+1)*7);
     const from=Math.floor(index*words.length/segmentCount);
     const to=Math.floor((index+1)*words.length/segmentCount);
     const scene=scenes.find((item:{startSeconds?:number;endSeconds?:number})=>Number(item.endSeconds)>startSeconds&&Number(item.startSeconds)<endSeconds);
     return {
       sequence:index+1,
       startSeconds,
       endSeconds,
       durationSeconds:endSeconds-startSeconds,
       narration:words.slice(from,to).join(" "),
       visualPrompt:scene?.visualPrompt??"",
       onScreenText:scene?.onScreenText??"",
       outputStoragePath:user.id+"/"+existing.id+"/segments/segment-"+String(index+1).padStart(2,"0")+".mp4"
     };
   });
   const callbackUrl=(process.env.NEXT_PUBLIC_APP_URL||"").replace(/\/$/,"")+"/api/video-production/complete";
   if(!process.env.NEXT_PUBLIC_APP_URL)return NextResponse.json({error:"NEXT_PUBLIC_APP_URL is required for the production callback."},{status:503});
   const snapshot={
     status:"approved",
     approved_at:new Date().toISOString(),
     approved_script_snapshot:approvedScript,
     approved_script_hash:scriptHash,
     video_segments:segments,
     video_production_status:"queued",
     video_verification:{stage:"awaiting_render",scriptHash,segmentCount}
   };
   const {data:locked,error:lockError}=await s.from("content_ideas").update(snapshot).eq("id",existing.id).eq("owner_id",user.id).select("*").maybeSingle();
   if(lockError||!locked)return NextResponse.json({error:"Could not freeze the approved script before production.",details:lockError?.message},{status:500});
   try{
     const response=await fetch(webhook,{
       method:"POST",
       headers:{"Content-Type":"application/json",...(process.env.N8N_WEBHOOK_SECRET?{"x-webhook-secret":process.env.N8N_WEBHOOK_SECRET}:{})},
       body:JSON.stringify({
         event:"content_approved",
         ownerId:user.id,
         callback:{url:callbackUrl,method:"POST",secretHeader:"x-production-callback-secret",secretEnvironmentVariable:"N8N_WEBHOOK_SECRET"},
         storage:{provider:"supabase",bucket:"generated-videos",private:true,finalPath:user.id+"/"+existing.id+"/final.mp4",segmentFolder:user.id+"/"+existing.id+"/segments"},
         idea:{
           id:existing.id,
           title:existing.title,
           approvedScript,
           approvedScriptHash:scriptHash,
           targetDurationSeconds:duration,
           aspectRatio:"9:16",
           resolution:"1080x1920",
           platforms:["youtube_shorts","instagram_reels"],
           segments,
           assembly:{
             order:"sequence_ascending",
             concatenateAllSegments:true,
             preserveTimeline:true,
             addNarrationFromApprovedSegmentText:true,
             captionsFromApprovedScriptOnly:true,
             transitions:"short_consistent_crossfade",
             normalizeAudio:true,
             finalDurationSeconds:duration
           },
           validation:{
             transcribeFinalRenderedAudio:true,
             compareTranscriptAgainstApprovedScript:true,
             comparison:"case_and_punctuation_insensitive_exact_word_sequence",
             requireAllSegmentsInOrder:true,
             failClosed:true,
             doNotMarkReadyOnMismatch:true
           }
         }
       }),
       signal:AbortSignal.timeout(20000)
     });
     if(!response.ok){
       const detail=(await response.text()).slice(0,500);
       await logWorkflowEvent({ownerId:user.id,ideaId:existing.id,workflow:"video_production",eventKey:"dispatch_failed",stage:"n8n_dispatch",status:"failed",message:"n8n rejected the production request.",metadata:{detail}});
       await s.from("content_ideas").update({video_production_status:"failed",video_verification:{stage:"dispatch_failed",detail}}).eq("id",existing.id).eq("owner_id",user.id);
       await s.from("app_notifications").insert({owner_id:user.id,notification_type:"video_production_failed",title:"Video production could not start",message:"The approved video could not be queued. Check the n8n production workflow configuration.",resource_type:"content_idea",resource_id:existing.id,metadata:{stage:"dispatch_failed"}});
       return NextResponse.json({error:"n8n rejected the production request.",details:detail},{status:502});
     }
     await logWorkflowEvent({ownerId:user.id,ideaId:existing.id,workflow:"video_production",eventKey:"approval_queued",stage:"approved_and_queued",status:"queued",message:"Owner approved the frozen script; video production was dispatched to n8n.",metadata:{segments:segments.length,scriptHash}});
     return NextResponse.json({idea:locked,productionDispatch:"queued",segments:segments.length});
   }catch(error){
     const detail=error instanceof Error?error.message:"Production dispatch failed.";
     await logWorkflowEvent({ownerId:user.id,ideaId:existing.id,workflow:"video_production",eventKey:"dispatch_failed",stage:"n8n_dispatch",status:"failed",message:"Could not dispatch video production.",metadata:{detail}});
     await s.from("content_ideas").update({video_production_status:"failed",video_verification:{stage:"dispatch_failed",detail}}).eq("id",existing.id).eq("owner_id",user.id);
     await s.from("app_notifications").insert({owner_id:user.id,notification_type:"video_production_failed",title:"Video production could not start",message:"The approved video could not be queued. Check the n8n production workflow configuration.",resource_type:"content_idea",resource_id:existing.id,metadata:{stage:"dispatch_failed"}});
     return NextResponse.json({error:"Could not dispatch video production.",details:detail},{status:502});
   }
 }
 const {data,error}=await s.from("content_ideas").update({status:body.status}).eq("id",body.id).eq("owner_id",user.id).select("*").maybeSingle();
 if(error)return NextResponse.json({error:"Could not update status.",details:error.message},{status:500});
 if(!data)return NextResponse.json({error:"Idea not found."},{status:404});
 await logWorkflowEvent({ownerId:user.id,ideaId:data.id,workflow:"video_production",eventKey:"approval_status_changed",stage:body.status==="rejected"?"rejected":"approval_status_updated",status:"completed",message:"Owner changed the content approval status to "+body.status+".",metadata:{approvalStatus:body.status}});
 return NextResponse.json({idea:data,productionDispatch:"not_requested"});
}
