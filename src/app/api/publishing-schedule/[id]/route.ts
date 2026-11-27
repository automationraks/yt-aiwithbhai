import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {logWorkflowEvent} from "@/lib/workflow-events";
import {getActiveWorkspace} from "@/lib/workspaces/context";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(_req:Request,ctx:{params:Promise<{id:string}>}){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const ws=await getActiveWorkspace(db,user.id);if(!ws)return NextResponse.json({error:"Create a workspace first."},{status:409});
 const {id}=await ctx.params;
 const {data:target,error}=await db.from("publishing_targets").select("*").eq("id",id).eq("owner_id",user.id).eq("channel_workspace_id",ws.id).maybeSingle();
 if(error||!target)return NextResponse.json({error:"Publishing target not found."},{status:404});
 if(target.status!=="failed")return NextResponse.json({error:"Only failed platform targets can be retried."},{status:409});
 const {data:controls}=await db.from("operations_controls").select("control_key,enabled").eq("owner_id",user.id).in("control_key",["publishing_all","publishing_"+target.platform]);
 if((controls??[]).some(x=>x.enabled===false))return NextResponse.json({error:"Publishing is paused in Automation Control."},{status:423});
 const {data:idea,error:ideaError}=await db.from("content_ideas").select("id,title,video_storage_path,script_package,target_duration_seconds").eq("id",target.idea_id).eq("owner_id",user.id).eq("channel_workspace_id",ws.id).maybeSingle();
 if(ideaError||!idea?.video_storage_path)return NextResponse.json({error:"The rendered video is no longer available. It cannot be retried."},{status:409});
 const webhook=process.env.N8N_PUBLISHING_WEBHOOK_URL;if(!webhook)return NextResponse.json({error:"N8N_PUBLISHING_WEBHOOK_URL is not configured."},{status:503});
 const now=new Date().toISOString();
 const {data:updated,error:updateError}=await db.from("publishing_targets").update({status:"scheduled",scheduled_at:now,dispatch_status:"pending",error_message:null,updated_at:now}).eq("id",id).eq("owner_id",user.id).eq("channel_workspace_id",ws.id).eq("status","failed").select("*").single();
 if(updateError||!updated)return NextResponse.json({error:"Could not requeue publishing target.",details:updateError?.message},{status:500});
 try{
  const response=await fetch(webhook,{method:"POST",headers:{"Content-Type":"application/json",...(process.env.N8N_WEBHOOK_SECRET?{"x-webhook-secret":process.env.N8N_WEBHOOK_SECRET}:{})},body:JSON.stringify({event:"video_scheduled",ownerId:user.id,idea:{id:idea.id,title:idea.title,videoStoragePath:idea.video_storage_path,approvedScript:idea.script_package?.voiceover??idea.script_package?.script??"",durationSeconds:idea.target_duration_seconds},targets:[{id:updated.id,platform:updated.platform,scheduledAt:now,status:"scheduled"}],callback:{url:(process.env.NEXT_PUBLIC_APP_URL??"").replace(/\/$/,"")+"/api/publishing-schedule/callback",secretHeader:"x-publishing-callback-secret"}}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error("n8n returned HTTP "+response.status+": "+(await response.text()).slice(0,400));
  await db.from("publishing_targets").update({dispatch_status:"sent",dispatch_attempted_at:now}).eq("id",id);
  await logWorkflowEvent({ownerId:user.id,ideaId:idea.id,workflow:"publishing",eventKey:"platform_publish_retry_queued",stage:"retry_queued",status:"queued",message:"Failed "+target.platform+" publishing target was manually retried.",metadata:{targetId:id,platform:target.platform}});
  return NextResponse.json({ok:true,target:updated,dispatch:"sent"});
 }catch(e){
  const message=e instanceof Error?e.message:"Dispatch failed.";
  await db.from("publishing_targets").update({status:"failed",dispatch_status:"failed",error_message:message,updated_at:new Date().toISOString()}).eq("id",id);
  return NextResponse.json({error:"Retry dispatch failed.",details:message},{status:502});
 }
}
export async function DELETE(_req:Request,ctx:{params:Promise<{id:string}>}){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const ws=await getActiveWorkspace(db,user.id);if(!ws)return NextResponse.json({error:"Create a workspace first."},{status:409});
 const {id}=await ctx.params;const {data:target,error}=await db.from("publishing_targets").select("id,idea_id,status,dispatch_status").eq("id",id).eq("owner_id",user.id).eq("channel_workspace_id",ws.id).maybeSingle();
 if(error||!target)return NextResponse.json({error:"Publishing target not found."},{status:404});
 if(target.status!=="scheduled"||target.dispatch_status==="sent")return NextResponse.json({error:"This target has already been dispatched to n8n. Cancel its active execution in n8n before changing its state; this API will not claim to stop an in-flight workflow."},{status:409});
 const {error:updateError}=await db.from("publishing_targets").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",user.id).eq("channel_workspace_id",ws.id);
 if(updateError)return NextResponse.json({error:"Could not cancel target.",details:updateError.message},{status:500});
 await logWorkflowEvent({ownerId:user.id,ideaId:target.idea_id,workflow:"publishing",eventKey:"platform_schedule_cancelled",stage:"cancelled",status:"skipped",message:"Pending platform schedule cancelled before dispatch.",metadata:{targetId:id}});
 return NextResponse.json({ok:true,cancelled:true});
}