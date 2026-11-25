import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logWorkflowEvent } from "@/lib/workflow-events";
export const dynamic="force-dynamic";
const validPlatform=(x:unknown):x is "youtube"|"instagram"=>x==="youtube"||x==="instagram";
export async function GET(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const{data:{user},error}=await db.auth.getUser();if(error||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const{data,error:loadError}=await db.from("publishing_targets").select("*").eq("owner_id",user.id).order("scheduled_at",{ascending:true});
 if(loadError)return NextResponse.json({error:"Could not load publishing schedule.",details:loadError.message},{status:500});
 return NextResponse.json({targets:data??[]});
}
export async function POST(req:Request){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const{data:{user},error}=await db.auth.getUser();if(error||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 let body:Record<string,unknown>;try{body=await req.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 if(typeof body.ideaId!=="string"||!Array.isArray(body.targets))return NextResponse.json({error:"Provide ideaId and platform targets."},{status:400});
 const{data:idea,error:ideaError}=await db.from("content_ideas").select("id,title,status,video_production_status,video_storage_path,video_verification,target_duration_seconds,script_package").eq("id",body.ideaId).eq("owner_id",user.id).is("deleted_at",null).maybeSingle();
 if(ideaError||!idea)return NextResponse.json({error:"Video idea not found.",details:ideaError?.message},{status:404});
 if(idea.video_production_status!=="ready"||!idea.video_storage_path||idea.video_verification?.transcriptMatchesApprovedScript!==true)return NextResponse.json({error:"Only a rendered video with a verified approved-script transcript can be scheduled."},{status:409});
 const requested=body.targets as Array<Record<string,unknown>>;if(requested.length!==2||requested.some(x=>!validPlatform(x.platform)||typeof x.scheduledAt!=="string"||!Number.isFinite(Date.parse(x.scheduledAt))))return NextResponse.json({error:"Provide one or both valid YouTube/Instagram schedule times."},{status:400});
 const unique=new Set(requested.map(x=>x.platform));if(unique.size!==2||!unique.has("youtube")||!unique.has("instagram"))return NextResponse.json({error:"Both YouTube and Instagram must be scheduled."},{status:400});
 const{data:previous,error:previousError}=await db.from("publishing_targets").select("platform,status").eq("owner_id",user.id).eq("idea_id",idea.id);if(previousError)return NextResponse.json({error:"Could not verify existing schedules.",details:previousError.message},{status:500});if((previous??[]).some(x=>x.status==="published"))return NextResponse.json({error:"A published platform cannot be scheduled again from this screen."},{status:409});
 const now=Date.now();if(requested.some(x=>Date.parse(String(x.scheduledAt))<now-60000))return NextResponse.json({error:"Schedule times must be in the future."},{status:400});
 const rows=requested.map(x=>({owner_id:user.id,idea_id:idea.id,platform:x.platform,scheduled_at:new Date(String(x.scheduledAt)).toISOString(),status:"scheduled",dispatch_status:process.env.N8N_PUBLISHING_WEBHOOK_URL?"pending":"not_configured",updated_at:new Date().toISOString()}));
 const{data:saved,error:saveError}=await db.from("publishing_targets").upsert(rows,{onConflict:"owner_id,idea_id,platform"}).select("*");
 if(saveError)return NextResponse.json({error:"Could not save platform schedules.",details:saveError.message},{status:500});
 const webhook=process.env.N8N_PUBLISHING_WEBHOOK_URL;let dispatch="not_configured";
 if(webhook){try{const response=await fetch(webhook,{method:"POST",headers:{"Content-Type":"application/json",...(process.env.N8N_WEBHOOK_SECRET?{"x-webhook-secret":process.env.N8N_WEBHOOK_SECRET}:{})},body:JSON.stringify({event:"video_scheduled",ownerId:user.id,idea:{id:idea.id,title:idea.title,videoStoragePath:idea.video_storage_path,approvedScript:idea.script_package?.voiceover??idea.script_package?.script??"",durationSeconds:idea.target_duration_seconds},targets:saved?.map(x=>({id:x.id,platform:x.platform,scheduledAt:x.scheduled_at,status:x.status})),callback:{url:(process.env.NEXT_PUBLIC_APP_URL??"").replace(/\/$/,"")+"/api/publishing-schedule/callback",secretHeader:"x-publishing-callback-secret"}}),signal:AbortSignal.timeout(15000)});dispatch=response.ok?"sent":"failed";if(!response.ok){const detail=(await response.text()).slice(0,500);await db.from("publishing_targets").update({dispatch_status:"failed",error_message:detail,dispatch_attempted_at:new Date().toISOString()}).eq("owner_id",user.id).eq("idea_id",idea.id).in("platform",requested.map(x=>String(x.platform)));}}catch(e){dispatch="failed";await db.from("publishing_targets").update({dispatch_status:"failed",error_message:e instanceof Error?e.message:"Webhook request failed",dispatch_attempted_at:new Date().toISOString()}).eq("owner_id",user.id).eq("idea_id",idea.id).in("platform",requested.map(x=>String(x.platform)));}}
 if(dispatch==="sent")await db.from("publishing_targets").update({dispatch_status:"sent",dispatch_attempted_at:new Date().toISOString()}).eq("owner_id",user.id).eq("idea_id",idea.id).in("platform",requested.map(x=>String(x.platform)));
 await logWorkflowEvent({ownerId:user.id,ideaId:idea.id,workflow:"publishing",eventKey:"platforms_scheduled",stage:"scheduled",status:dispatch==="failed"?"failed":"scheduled",message:"Owner scheduled verified video publishing targets.",metadata:{targets:saved?.map(x=>({platform:x.platform,scheduledAt:x.scheduled_at})),dispatch}});
 return NextResponse.json({targets:saved??[],dispatch,dispatchPending:dispatch!=="sent"}, {status:dispatch==="failed"?502:200});
}
