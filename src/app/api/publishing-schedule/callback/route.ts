import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/auth/session";
import { logWorkflowEvent } from "@/lib/workflow-events";
export const runtime="nodejs";export const dynamic="force-dynamic";
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
async function removeTree(db:ReturnType<typeof createSupabaseAdminClient>,prefix:string):Promise<void>{
 const{data,error}=await db.storage.from("generated-videos").list(prefix,{limit:1000});
 if(error)throw error;const files:string[]=[];
 for(const item of data??[]){const path=prefix+"/"+item.name;if(item.id===null){await removeTree(db,path);}else files.push(path);}
 if(files.length){const{error:removeError}=await db.storage.from("generated-videos").remove(files);if(removeError)throw removeError;}
}
export async function POST(req:Request){
 const secret=process.env.N8N_PUBLISHING_CALLBACK_SECRET;if(!secret)return NextResponse.json({error:"Publishing callback secret is not configured."},{status:503});
 const supplied=req.headers.get("x-publishing-callback-secret")??"";if(!equal(secret,supplied))return NextResponse.json({error:"Unauthorized callback."},{status:401});
 let body:Record<string,unknown>;try{body=await req.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 const ownerId=String(body.ownerId??""),ideaId=String(body.ideaId??""),platform=body.platform,status=body.status;
 if(!ownerId||!ideaId||(platform!=="youtube"&&platform!=="instagram")||(status!=="published"&&status!=="failed"&&status!=="publishing"))return NextResponse.json({error:"Invalid publication callback."},{status:400});
 const db=createSupabaseAdminClient();
 const{data:target,error:targetError}=await db.from("publishing_targets").select("*").eq("owner_id",ownerId).eq("idea_id",ideaId).eq("platform",platform).maybeSingle();
 if(targetError||!target)return NextResponse.json({error:"Scheduled publishing target not found.",details:targetError?.message},{status:404});
 const patch={status,platform_post_id:typeof body.platformPostId==="string"?body.platformPostId:null,published_url:typeof body.publishedUrl==="string"?body.publishedUrl:null,published_at:status==="published"?(typeof body.publishedAt==="string"?body.publishedAt:new Date().toISOString()):null,error_message:status==="failed"?String(body.error??"Publishing failed").slice(0,1000):null,updated_at:new Date().toISOString()};
 const{error:updateError}=await db.from("publishing_targets").update(patch).eq("id",target.id);if(updateError)return NextResponse.json({error:"Could not update publication status.",details:updateError.message},{status:500});
 const{data:all,error:allError}=await db.from("publishing_targets").select("platform,status,published_url,published_at").eq("owner_id",ownerId).eq("idea_id",ideaId);
 if(allError)return NextResponse.json({error:allError.message},{status:500});
 const bothPublished=["youtube","instagram"].every(p=>(all??[]).some(x=>x.platform===p&&x.status==="published"));
 let mediaDeleted=false;
 if(bothPublished){
  const{data:idea,error:ideaError}=await db.from("content_ideas").select("video_storage_path").eq("id",ideaId).eq("owner_id",ownerId).maybeSingle();
  if(ideaError)return NextResponse.json({error:ideaError.message},{status:500});
  if(idea?.video_storage_path){try{await removeTree(db,ownerId+"/"+ideaId);const{error:clearError}=await db.from("content_ideas").update({video_storage_path:null}).eq("id",ideaId).eq("owner_id",ownerId);if(clearError)throw clearError;mediaDeleted=true;}catch(e){return NextResponse.json({error:"Both platforms published, but media cleanup failed.",details:e instanceof Error?e.message:"Storage cleanup failed",bothPublished:true},{status:500});}}
 }
 await logWorkflowEvent({ownerId,ideaId,workflow:"publishing",eventKey:"platform_publish_"+status,stage:"platform_"+status,status:status==="failed"?"failed":"completed",message:platform+" publication status: "+status+".",metadata:{platform,publishedUrl:patch.published_url,bothPublished,mediaDeleted}});
 return NextResponse.json({ok:true,platform,status,bothPublished,mediaDeleted,targets:all??[]});
}
