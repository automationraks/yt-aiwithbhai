import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/auth/session";
import { logWorkflowEvent } from "@/lib/workflow-events";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(_request:Request,context:{params:Promise<{id:string}>}){
 const supabase=await createSupabaseServerClient();
 if(!supabase)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const {id}=await context.params;
 const {data:idea,error:ideaError}=await supabase.from("content_ideas").select("id,status,video_production_status,approved_script_hash").eq("id",id).eq("owner_id",user.id).maybeSingle();
 if(ideaError||!idea)return NextResponse.json({error:"Video production record not found."},{status:404});
 if(idea.status!=="approved"||!idea.approved_script_hash)return NextResponse.json({error:"Only an already-approved, frozen script can be retried."},{status:409});
 if(!["failed","queued"].includes(String(idea.video_production_status)))return NextResponse.json({error:"Retry is available only for failed or queued production jobs."},{status:409});
 const admin=createSupabaseAdminClient();
 const {data:job,error:jobError}=await admin.from("video_render_jobs").select("id,status,script_hash,attempts").eq("idea_id",id).eq("owner_id",user.id).eq("script_hash",idea.approved_script_hash).maybeSingle();
 if(jobError||!job)return NextResponse.json({error:"Original render job was not found."},{status:404});
 if(job.status==="processing"||job.status==="completed")return NextResponse.json({error:"This job is already processing or completed."},{status:409});
 const {error:updateJobError}=await admin.from("video_render_jobs").update({status:"queued",attempts:0,claimed_by:null,lease_expires_at:null,last_heartbeat_at:null,error:null,completed_at:null,updated_at:new Date().toISOString()}).eq("id",job.id).in("status",["failed","queued"]);
 if(updateJobError)return NextResponse.json({error:"Could not requeue render job.",details:updateJobError.message},{status:500});
 const {error:updateIdeaError}=await supabase.from("content_ideas").update({video_production_status:"queued",video_verification:{stage:"retry_queued",jobId:job.id,previousAttempts:job.attempts}}).eq("id",id).eq("owner_id",user.id);
 if(updateIdeaError)return NextResponse.json({error:"Job was requeued but idea status could not be updated.",details:updateIdeaError.message},{status:500});
 await logWorkflowEvent({ownerId:user.id,ideaId:id,workflow:"video_production",eventKey:"render_retry_queued",stage:"retry_queued",status:"queued",message:"Owner manually requeued the previously approved render job.",metadata:{jobId:job.id,previousAttempts:job.attempts}});
 return NextResponse.json({ok:true,queued:true,jobId:job.id});
}
