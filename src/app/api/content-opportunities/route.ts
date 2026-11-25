import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateResearchJson } from "@/lib/ai/research";
import { logWorkflowEvent } from "@/lib/workflow-events";
export const runtime="nodejs";export const dynamic="force-dynamic";
const system = `You are a YouTube content strategist and senior AI systems engineer for AIWithBh@i. Audience: software engineers, architects and IT professionals. Focus on practical AI system design, LLM architecture, RAG, agents, model serving, production reliability, security, evaluation and enterprise use cases across retail, healthcare, airlines, banking, finance and logistics. Return JSON only: {ideas:[{title,hook,industry,topic,format,language,audience,problem,architectureAngle,outline:[...],differentiation,whyNow,opportunityScore,sourceVideoIds:[...],sourceInstagramIds:[...],scriptPackage:{complexity,estimatedDurationSeconds,script,voiceover,scenes:[{startSeconds,endSeconds,narration,visualPrompt,onScreenText,audioDirection}],instagramCaption,hashtags,youtubeTitle,youtubeDescription,videoStyle}}]}. Generate 6-10 original ideas, each citing at least one supplied YouTube video or Instagram post when relevant. Prefer using both platforms when both provide useful evidence. Use only supplied IDs. Never invent reference links or facts. Do not copy competitor titles; create distinct angles. Prefer case-study-first scenario explainers with architecture diagrams and trade-offs. Avoid generic news and shallow listicles. Score niche fit, usefulness, evidence quality, freshness and differentiation. Every idea must include a complete ready-to-produce vertical short package in scriptPackage: {complexity:"simple|medium|complex",estimatedDurationSeconds:integer,script:string,voiceover:string,scenes:[{startSeconds:number,endSeconds:number,visualPrompt:string,onScreenText:string}],instagramCaption:string,hashtags:string[],youtubeTitle:string,youtubeDescription:string,videoStyle:string}. The narration must be 40-59 seconds, written in natural Indian English (India accent), with a strong first 2-second hook, clear payoff and concise CTA. Divide the visual plan into sequential frames of exactly 7 seconds except the final remainder. Every frame must specify narration, visual prompt, camera/motion, on-screen text and sound design. Output 9:16 portrait. Write narration at a natural pace that fits the selected duration; do not pad. Use a strong first 2-second hook, accurate facts, original scene prompts and a clear ending. Produce a single 9:16 video concept suitable for both YouTube Shorts and Instagram Reels. Long videos are not required.`;
export async function GET(){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:a}=await s.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 // Historical opportunities must remain visible even when their source channels/posts
 // are later removed from the active shortlist or refreshed out of the current source set.
 const {data,error}=await s.from("content_ideas").select("*").eq("owner_id",user.id).is("deleted_at",null).order("created_at",{ascending:false}).limit(100);
 if(error)return NextResponse.json({error:"Could not load content opportunities.",details:error.message},{status:500});
 return NextResponse.json({ideas:data??[]});
}
export async function POST(){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});const {data:{user},error:a}=await s.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const {data:channels,error:ce}=await s.from("competitors").select("id,channel_title,channel_url").eq("owner_id",user.id).eq("is_active",true).eq("ai_production_status","qualified").limit(100);if(ce)return NextResponse.json({error:"Could not load shortlisted channels.",details:ce.message},{status:500});const ids=(channels??[]).map(x=>x.id);
 const {data:rows,error:ve}=ids.length?await s.from("videos").select("youtube_video_id,title,description,published_at,view_count,video_url,competitor_id").in("competitor_id",ids).eq("is_niche_relevant",true).order("published_at",{ascending:false}).limit(100):{data:[],error:null};if(ve)return NextResponse.json({error:"Could not load reference videos.",details:ve.message},{status:500});
 const cmap=new Map((channels??[]).map(x=>[x.id,x]));const videoMap=new Map<string,Record<string,unknown>>((rows??[]).map(v=>[v.youtube_video_id,{videoId:v.youtube_video_id,title:v.title,description:(v.description??"").slice(0,700),publishedAt:v.published_at,views:v.view_count,url:v.video_url??("https://www.youtube.com/watch?v="+v.youtube_video_id),channel:cmap.get(v.competitor_id)?.channel_title??"Shortlisted channel",channelUrl:cmap.get(v.competitor_id)?.channel_url??null,platform:"youtube"}]));
 const {data:shortlists,error:shortlistError}=await s.from("video_shortlists").select("social_video_id,source_feature").eq("owner_id",user.id).order("shortlisted_at",{ascending:false}).limit(500);if(shortlistError)return NextResponse.json({error:"Could not load Video Explorer shortlists.",details:shortlistError.message},{status:500});
 const socialIds=(shortlists??[]).map(x=>x.social_video_id);const {data:socialVideos,error:socialError}=socialIds.length?await s.from("social_videos").select("*").eq("owner_id",user.id).in("id",socialIds):{data:[],error:null};if(socialError)return NextResponse.json({error:"Could not load unified shortlisted videos.",details:socialError.message},{status:500});
 for(const v of socialVideos??[]){if(v.platform==="youtube"&&!videoMap.has(v.external_video_id))videoMap.set(v.external_video_id,{videoId:v.external_video_id,title:v.title,description:(v.description??"").slice(0,700),publishedAt:v.published_at,views:v.view_count,url:v.permalink,channel:v.source_channel_name??"Shortlisted YouTube channel",channelUrl:v.source_channel_url,platform:"youtube"});}
 const videos=[...videoMap.values()];
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
 const instagramMap=new Map<string,Record<string,unknown>>((instagramRows??[]).map(post=>[post.instagram_media_id,{mediaId:post.instagram_media_id,username:post.source_username,title:(post.caption??"").slice(0,180)||("Instagram "+(post.media_product_type??post.media_type??"post")+" by @"+post.source_username),caption:(post.caption??"").slice(0,900),url:post.permalink,publishedAt:post.timestamp,mediaType:post.media_type,productType:post.media_product_type,likes:post.like_count,comments:post.comments_count,platform:"instagram"}]));
 for(const v of socialVideos??[])if(v.platform==="instagram")instagramMap.set(v.external_video_id,{mediaId:v.external_video_id,username:v.source_channel_name??"creator",title:v.title,caption:(v.description??"").slice(0,900),url:v.permalink,publishedAt:v.published_at,mediaType:"VIDEO",productType:"REELS",likes:v.like_count,comments:v.comment_count,platform:"instagram"});
 const instagramPosts=[...instagramMap.values()];
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
   const duration=Number.isFinite(requestedDuration)?Math.max(40,Math.min(59,Math.round(requestedDuration))):Math.max(40,fallbackDuration);
   const rawScenes=Array.isArray(pkg.scenes)?pkg.scenes:[];const scenes=Array.from({length:Math.ceil(duration/7)},(_,index)=>{const startSeconds=index*7,endSeconds=Math.min(duration,(index+1)*7);const scene=rawScenes.find((item:Record<string,unknown>)=>Number(item.endSeconds)>startSeconds&&Number(item.startSeconds)<endSeconds) as Record<string,unknown>|undefined;const from=Math.floor(index*narrationWords.length/Math.ceil(duration/7)),to=Math.floor((index+1)*narrationWords.length/Math.ceil(duration/7));return {startSeconds,endSeconds,narration:String(scene?.narration??narrationWords.slice(from,to).join(" ")),visualPrompt:String(scene?.visualPrompt??"Realistic, technically accurate visual illustrating this narration frame"),onScreenText:String(scene?.onScreenText??""),audioDirection:String(scene?.audioDirection??"Indian English voiceover, clear pronunciation, subtle sound design")};});const scriptPackage={complexity,estimatedDurationSeconds:duration,script:String(pkg.script??""),voiceover:String(pkg.voiceover??pkg.script??""),scenes,instagramCaption:String(pkg.instagramCaption??""),hashtags:Array.isArray(pkg.hashtags)?pkg.hashtags.filter((x):x is string=>typeof x==="string").slice(0,15):[],youtubeTitle:String(pkg.youtubeTitle??title),youtubeDescription:String(pkg.youtubeDescription??""),videoStyle:String(pkg.videoStyle??"Vertical 9:16, clean technical motion graphics, readable subtitles, crisp HD visuals")};
   return {owner_id:user.id,title,hook:String(item.hook??"").slice(0,700),outline:Array.isArray(item.outline)?item.outline.slice(0,12):[],format:"short",language:"en-IN",topic:String(item.topic??item.industry??"AI system design").slice(0,180),opportunity_score:Math.max(0,Math.min(100,Number(item.opportunityScore)||0)),source_video_ids:sourceIds,source_references:references,idea_key:key,status:"idea",script_package:scriptPackage,target_duration_seconds:duration,video_production_status:"not_started"};
 }).filter(x=>x.title&&(x.source_video_ids.length>0||x.source_references.some(ref=>ref.platform==="instagram"))&&x.idea_key&&x.script_package.script.trim().length>0&&x.script_package.scenes.length===Math.ceil(x.target_duration_seconds/7));
 if(!videos.length&&!instagramPosts.length)return NextResponse.json({error:"Video Explorer has no shortlisted videos yet. Add YouTube or Instagram videos to its shortlist first."},{status:409});if(!ideas.length)return NextResponse.json({error:"AI did not produce ideas with valid shortlisted-video references. Refresh competitor videos and retry."},{status:502});const {data:saved,error}=await s.from("content_ideas").upsert(ideas,{onConflict:"owner_id,idea_key",ignoreDuplicates:true}).select("*");if(error)return NextResponse.json({error:"Could not save opportunities. Apply the research migration first.",details:error.message},{status:500});const {data:all}=await s.from("content_ideas").select("*").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(100);const visibleIdeas=(all??[]).filter(idea=>(Array.isArray(idea.source_video_ids)&&idea.source_video_ids.some((id:string)=>valid.has(id)))||(Array.isArray(idea.source_references)&&idea.source_references.some((ref:{platform?:string;mediaId?:string})=>ref.platform==="instagram"&&typeof ref.mediaId==="string"&&validInstagram.has(ref.mediaId)))).slice(0,60);await s.from("ai_usage_logs").insert({owner_id:user.id,task:"content_opportunities_generation",provider:result.provider,model:result.model,input_tokens:result.usage.inputTokens,output_tokens:result.usage.outputTokens,total_tokens:result.usage.totalTokens,estimated_cost_usd:result.usage.estimatedCostUsd,cost_is_estimate:true,fallback_used:result.fallbackUsed,duration_ms:result.usage.durationMs,metadata:{generated:ideas.length,newlySaved:saved?.length??0}});await logWorkflowEvent({ownerId:user.id,workflow:"idea_generation",eventKey:"generation_completed",stage:"generation_completed",status:"completed",message:"Manual content-opportunity research generated video idea packages.",metadata:{generated:ideas.length,newlySaved:saved?.length??0,provider:result.provider,model:result.model,fallbackUsed:result.fallbackUsed,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens,totalTokens:result.usage.totalTokens,estimatedCostUsd:result.usage.estimatedCostUsd,costIsEstimate:true,youtubeSources:videos.length,instagramSources:instagramPosts.length}});return NextResponse.json({ideas:visibleIdeas.length?visibleIdeas:saved??[],generated:ideas.length,newlySaved:saved?.length??0,provider:result.provider,fallbackUsed:result.fallbackUsed,referenceVideosUsed:videos.length,instagramPostsUsed:instagramPosts.length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Opportunity generation failed."},{status:502});}
}
export async function PATCH(request:Request){
 const s=await createSupabaseServerClient();
 if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:a}=await s.auth.getUser();
 if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 let body:{id?:unknown;status?:unknown;action?:unknown;comments?:unknown};
 try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 const action=String(body.action??"");
 if(typeof body.id!=="string")return NextResponse.json({error:"Provide an idea id."},{status:400});
 if(action==="decline"){const{data,error}=await s.from("content_ideas").update({status:"rejected",deleted_at:new Date().toISOString()}).eq("id",body.id).eq("owner_id",user.id).is("deleted_at",null).select("id").maybeSingle();if(error)return NextResponse.json({error:error.message},{status:500});if(!data)return NextResponse.json({error:"Idea not found."},{status:404});await logWorkflowEvent({ownerId:user.id,ideaId:body.id,workflow:"idea_generation",eventKey:"idea_declined",stage:"declined",status:"completed",message:"Owner declined and archived a content idea.",metadata:{softDeleted:true}});return NextResponse.json({ok:true,deleted:true});}
 if(action==="regenerate"){const{data:idea,error}=await s.from("content_ideas").select("*").eq("id",body.id).eq("owner_id",user.id).is("deleted_at",null).maybeSingle();if(error||!idea)return NextResponse.json({error:"Idea not found.",details:error?.message},{status:404});if(idea.status==="approved"||["queued","processing","ready"].includes(String(idea.video_production_status)))return NextResponse.json({error:"Approved or queued ideas cannot be regenerated."},{status:409});const comments=String(body.comments??"").trim().slice(0,2000);if(!comments)return NextResponse.json({error:"Add regeneration comments first."},{status:400});try{const generated=await generateResearchJson("You write original 40-59 second Indian English technical Shorts scripts for software engineers. Return JSON only: {script,voiceover,estimatedDurationSeconds,scenes:[{visualPrompt,onScreenText,audioDirection}]}. Make exactly sequential 7-second frames except the final remainder. Include strong hook, technical clarity, payoff, CTA and vertical 9:16 visual direction.",JSON.stringify({title:idea.title,hook:idea.hook,topic:idea.topic,existingScript:idea.script_package?.script,existingScenes:idea.script_package?.scenes,ownerFeedback:comments}));const pkg=generated.data as Record<string,unknown>;const duration=Math.max(40,Math.min(59,Math.round(Number(pkg.estimatedDurationSeconds)||Number(idea.target_duration_seconds)||45)));const voiceover=String(pkg.voiceover??pkg.script??"").trim();const words=voiceover.split(/\\s+/).filter(Boolean);const raw=Array.isArray(pkg.scenes)?pkg.scenes as Array<Record<string,unknown>>:[];const count=Math.ceil(duration/7);const scenes=Array.from({length:count},(_,i)=>{const from=Math.floor(i*words.length/count),to=Math.floor((i+1)*words.length/count),src=raw[i]??{};return{startSeconds:i*7,endSeconds:Math.min(duration,(i+1)*7),narration:words.slice(from,to).join(" "),visualPrompt:String(src.visualPrompt??"Technically accurate visual for this narration"),onScreenText:String(src.onScreenText??""),audioDirection:String(src.audioDirection??"Indian English narration, clear pronunciation")};});if(!voiceover)return NextResponse.json({error:"AI returned an empty narration. Retry."},{status:502});const script_package={...idea.script_package,script:String(pkg.script??voiceover),voiceover,estimatedDurationSeconds:duration,scenes};const{data:updated,error:updateError}=await s.from("content_ideas").update({script_package,target_duration_seconds:duration}).eq("id",idea.id).eq("owner_id",user.id).select("*").single();if(updateError)return NextResponse.json({error:updateError.message},{status:500});await s.from("ai_usage_logs").insert({owner_id:user.id,idea_id:idea.id,task:"content_idea_regeneration",provider:generated.provider,model:generated.model,input_tokens:generated.usage.inputTokens,output_tokens:generated.usage.outputTokens,total_tokens:generated.usage.totalTokens,estimated_cost_usd:generated.usage.estimatedCostUsd,cost_is_estimate:true,fallback_used:generated.fallbackUsed,duration_ms:generated.usage.durationMs,metadata:{comments}});await logWorkflowEvent({ownerId:user.id,ideaId:idea.id,workflow:"idea_generation",eventKey:"idea_regenerated",stage:"regenerated",status:"completed",message:"Script regenerated using owner feedback.",metadata:{provider:generated.provider,model:generated.model}});return NextResponse.json({idea:updated,provider:generated.provider,model:generated.model});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Regeneration failed."},{status:502});}}
 const allowed=["idea","planned","approved","producing","published","rejected"];
 if(typeof body.status!=="string"||!allowed.includes(body.status))return NextResponse.json({error:"Provide a valid status or action."},{status:400});
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
   const duration=Math.max(40,Math.min(59,Number(existing.target_duration_seconds)||45));
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
