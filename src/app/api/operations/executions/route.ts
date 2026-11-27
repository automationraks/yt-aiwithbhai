import { NextRequest,NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
const allowed=["idea_generation","video_production","publishing"];
const statuses=["started","completed","failed","skipped","review_required","queued","processing","scheduled"];
export async function GET(req:NextRequest){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const p=req.nextUrl.searchParams,workflow=p.get("workflow"),status=p.get("status"),from=p.get("from"),to=p.get("to");
 const limit=Math.min(100,Math.max(1,Number(p.get("limit")||25)||25)),page=Math.max(1,Number(p.get("page")||1)||1);
 if(workflow&&workflow!=="all"&&!allowed.includes(workflow))return NextResponse.json({error:"Invalid workflow filter."},{status:400});
 if(status&&status!=="all"&&!statuses.includes(status))return NextResponse.json({error:"Invalid status filter."},{status:400});
 let q=db.from("workflow_event_logs").select("id,idea_id,workflow,event_key,stage,status,message,metadata,created_at",{count:"exact"}).eq("owner_id",user.id).order("created_at",{ascending:false});
 if(workflow&&workflow!=="all")q=q.eq("workflow",workflow);
 if(status&&status!=="all")q=q.eq("status",status);
 if(from&&Number.isFinite(Date.parse(from)))q=q.gte("created_at",new Date(from).toISOString());
 if(to&&Number.isFinite(Date.parse(to)))q=q.lte("created_at",new Date(to).toISOString());
 const {data,error,count}=await q.range((page-1)*limit,page*limit-1);
 if(error)return NextResponse.json({error:"Could not load execution history.",details:error.message},{status:500});
 return NextResponse.json({events:data??[],total:count??0,page,limit,pages:Math.ceil((count??0)/limit)});
}