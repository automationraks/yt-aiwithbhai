import { createHash,timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/auth/session";
export const runtime="nodejs";export const dynamic="force-dynamic";
type SegmentPlan = { sequence: number; outputStoragePath: string; durationSeconds: number };
type QueueRequest = { event?: unknown; ownerId?: unknown; idea?: { id?: unknown; approvedScript?: unknown; approvedScriptHash?: unknown; segments?: unknown; targetDurationSeconds?: unknown; title?: unknown }; callback?: { url?: unknown }; storage?: { bucket?: unknown; private?: unknown; finalPath?: unknown } };
const eq=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export async function POST(request:Request){
 const secret=process.env.N8N_WEBHOOK_SECRET;if(!secret||!eq(request.headers.get("authorization")??"","Bearer "+secret))return NextResponse.json({error:"Unauthorized"},{status:401});
 let b:QueueRequest;try{b=await request.json() as QueueRequest;}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
 if(b.event!=="content_approved"||typeof b.ownerId!=="string"||typeof b.idea?.id!=="string"||typeof b.idea?.approvedScript!=="string"||typeof b.idea?.approvedScriptHash!=="string"||!Array.isArray(b.idea?.segments))return NextResponse.json({error:"Invalid approved-video event"},{status:400});
 const requestIdea=b.idea!;
 const callbackUrl=b.callback!.url as string;
 const storage=b.storage!;
 const app=process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/,"");if(!app||callbackUrl!==app+"/api/video-production/complete")return NextResponse.json({error:"Invalid callback URL"},{status:400});
 const finalPath=b.ownerId+"/"+requestIdea.id+"/final.mp4";if(storage.bucket!=="generated-videos"||storage.private!==true||storage.finalPath!==finalPath)return NextResponse.json({error:"Invalid private storage destination"},{status:400});
 const hash=createHash("sha256").update(requestIdea.approvedScript,"utf8").digest("hex");if(!eq(hash,requestIdea.approvedScriptHash))return NextResponse.json({error:"Approved script hash mismatch"},{status:409});
 const db=createSupabaseAdminClient();const {data:idea,error}=await db.from("content_ideas").select("id,owner_id,status,approved_script_snapshot,approved_script_hash,video_segments").eq("id",requestIdea.id).eq("owner_id",b.ownerId).maybeSingle();
 if(error||!idea)return NextResponse.json({error:"Approved content record not found"},{status:404});
 if(idea.status!=="approved"||idea.approved_script_snapshot!==requestIdea.approvedScript||idea.approved_script_hash!==hash)return NextResponse.json({error:"Database approved-script snapshot mismatch"},{status:409});
 const expected:SegmentPlan[]=Array.isArray(idea.video_segments)?idea.video_segments as SegmentPlan[]:[],received=requestIdea.segments as SegmentPlan[];
 if(!expected.length||expected.length!==received.length||expected.some((s,i)=>s.sequence!==received[i]?.sequence||s.outputStoragePath!==received[i]?.outputStoragePath||!Number.isFinite(Number(received[i]?.durationSeconds))))return NextResponse.json({error:"Segment plan does not match approved record"},{status:409});
 const {data:old}=await db.from("video_render_jobs").select("id,status").eq("idea_id",idea.id).eq("script_hash",hash).maybeSingle();
 if(old)return NextResponse.json({ok:true,duplicate:true,jobId:old.id,status:old.status});
 const payload={ownerId:b.ownerId,ideaId:idea.id,approvedScript:requestIdea.approvedScript,scriptHash:hash,targetDurationSeconds:Number(requestIdea.targetDurationSeconds),callbackUrl:callbackUrl,storage,segments:received,title:String(requestIdea.title??"AIWithBh@i technical short").slice(0,180),language:"en"};
 const {data:job,error:insertError}=await db.from("video_render_jobs").insert({owner_id:b.ownerId,idea_id:idea.id,script_hash:hash,status:"queued",payload}).select("id,status").single();
 if(insertError)return NextResponse.json({error:"Could not queue job: "+insertError.message},{status:500});
 await db.from("content_ideas").update({video_production_status:"queued",video_verification:{stage:"waiting_for_local_worker",jobId:job.id}}).eq("id",idea.id).eq("owner_id",b.ownerId);
 return NextResponse.json({ok:true,queued:true,jobId:job.id,status:job.status},{status:202});
}
