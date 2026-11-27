import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logWorkflowEvent } from "@/lib/workflow-events";
import { getActiveWorkspace } from "@/lib/workspaces/context";
export const dynamic="force-dynamic";
const validPlatform=(x:unknown):x is "youtube"|"instagram"=>x==="youtube"||x==="instagram";
export async function GET(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const{data:{user},error}=await db.auth.getUser();if(error||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const ws=await getActiveWorkspace(db,user.id);if(!ws)return NextResponse.json({targets:[],activeWorkspace:null});
 const{data,error:loadError}=await db.from("publishing_targets").select("*").eq("owner_id",user.id).eq("channel_workspace_id",ws.id).order("scheduled_at",{ascending:true});
 if(loadError)return NextResponse.json({error:"Could not load publishing schedule.",details:loadError.message},{status:500});
 return NextResponse.json({targets:data??[]});
}
export async function POST(req:Request){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const{data:{user},error}=await db.auth.getUser();if(error||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const ws=await getActiveWorkspace(db,user.id);if(!ws)return NextResponse.json({error:"Create a workspace first."},{status:409});
 let body:Record<string,unknown>;try{body=await req.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 if(typeof body.ideaId!=="string"||!Array.isArray(body.targets))return NextResponse.json({error:"Provide ideaId and platform targets."},{status:400});
 const{data:idea,error:ideaError}=await db.from("content_ideas").select("id,title,status,video_production_status,video_storage_path,video_verification,target_duration_seconds,script_package,channel_workspace_id").eq("id",body.ideaId).eq("owner_id",user.id).eq("channel_workspace_id",ws.id).is("deleted_at",null).maybeSingle();
 if(ideaError||!idea)return NextResponse.json({error:"Video idea not found.",details:ideaError?.message},{status:404});
 if(idea.status!=="approved"||idea.video_production_status!=="ready"||!idea.video_storage_path||idea.video_verification?.transcriptMatchesApprovedScript!==true)return NextResponse.json({error:"Only an approved, rendered video with a verified approved-script transcript can be scheduled."},{status:409});
 const requested=body.targets as Array<Record<string,unknown>>;if(requested.length<1||requested.length>2||requested.some(x=>!validPlatform(x.platform)||typeof x.scheduledAt!=="string"||!Number.isFinite(Date.parse(x.scheduledAt))))return NextResponse.json({error:"Provide one or two valid YouTube/Instagram schedule times."},{status:400});
 const {data:controls}=await db.from("operations_controls").select("control_key,enabled").eq("owner_id",user.id).in("control_key",["publishing_all","publishing_youtube","publishing_instagram"]);const controlMap=new Map((controls??[]).map(x=>[x.control_key,x.enabled]));const blocked=requested.map(x=>String(x.platform)).filter(p=>controlMap.get("publishing_all")===false||controlMap.get("publishing_"+p)===false);if(blocked.length)return NextResponse.json({error:"Publishing is paused for: "+blocked.join(", ")+". Re-enable it in Automation Control before scheduling."},{status:423});
 const unique=new Set(requested.map(x=>x.platform));if(unique.size!==requested.length)return NextResponse.json({error:"Each platform can only have one schedule per video."},{status:400});
 const{data:previous,error:previousError}=await db.from("publishing_targets").select("platform,status").eq("owner_id",user.id).eq("idea_id",idea.id);if(previousError)return NextResponse.json({error:"Could not verify existing schedules.",details:previousError.message},{status:500});if((previous??[]).some(x=>x.status==="published"))return NextResponse.json({error:"At least one platform has already published this video. Use the failed-platform retry action instead of rescheduling both platforms."},{status:409});
 const now=Date.now();if(requested.some(x=>Date.parse(String(x.scheduledAt))<now-60000))return NextResponse.json({error:"Schedule times must be in the future."},{status:400});
 const rows=requested.map(x=>({owner_id:user.id,channel_workspace_id:ws.id,idea_id:idea.id,platform:x.platform,scheduled_at:new Date(String(x.scheduledAt)).toISOString(),status:"scheduled",dispatch_status:process.env.N8N_PUBLISHING_WEBHOOK_URL?"pending":"not_configured",updated_at:new Date().toISOString()}));
 const{data:saved,error:saveError}=await db.from("publishing_targets").upsert(rows,{onConflict:"owner_id,idea_id,platform"}).select("*");
 if(saveError)return NextResponse.json({error:"Could not save platform schedules.",details:saveError.message},{status:500});
 const webhook=process.env.N8N_PUBLISHING_WEBHOOK_URL;let dispatch="not_configured";
 if(webhook){try{const response=await fetch(webhook,{method:"POST",headers:{"Content-Type":"application/json",...(process.env.N8N_WEBHOOK_SECRET?{"x-webhook-secret":process.env.N8N_WEBHOOK_SECRET}:{})},body:JSON.stringify({event:"video_scheduled",ownerId:user.id,workspaceId:ws.id,idea:{id:idea.id,title:idea.title,videoStoragePath:idea.video_storage_path,approvedScript:idea.script_package?.voiceover??idea.script_package?.script??"",durationSeconds:idea.target_duration_seconds},targets:saved?.map(x=>({id:x.id,platform:x.platform,scheduledAt:x.scheduled_at,status:x.status})),callback:{url:(process.env.NEXT_PUBLIC_APP_URL??"").replace(/\/$/,"")+"/api/publishing-schedule/callback",secretHeader:"x-publishing-callback-secret"}}),signal:AbortSignal.timeout(15000)});dispatch=response.ok?"sent":"failed";if(!response.ok){const detail=(await response.text()).slice(0,500);await db.from("publishing_targets").update({dispatch_status:"failed",error_message:detail,dispatch_attempted_at:new Date().toISOString()}).eq("owner_id",user.id).eq("idea_id",idea.id).in("platform",requested.map(x=>String(x.platform)));}}catch(e){dispatch="failed";await db.from("publishing_targets").update({dispatch_status:"failed",error_message:e instanceof Error?e.message:"Webhook request failed",dispatch_attempted_at:new Date().toISOString()}).eq("owner_id",user.id).eq("idea_id",idea.id).in("platform",requested.map(x=>String(x.platform)));}}
 if(dispatch==="sent")await db.from("publishing_targets").update({dispatch_status:"sent",dispatch_attempted_at:new Date().toISOString()}).eq("owner_id",user.id).eq("idea_id",idea.id).in("platform",requested.map(x=>String(x.platform)));
 await logWorkflowEvent({ownerId:user.id,ideaId:idea.id,workflow:"publishing",eventKey:"platforms_scheduled",stage:"scheduled",status:dispatch==="failed"?"failed":"scheduled",message:"Owner scheduled an approved, transcript-verified video for YouTube and Instagram.",metadata:{targets:saved?.map(x=>({platform:x.platform,scheduledAt:x.scheduled_at})),dispatch}});
 return NextResponse.json({targets:saved??[],dispatch,dispatchPending:dispatch!=="sent"}, {status:dispatch==="failed"?502:200});
}
