import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:a}=await s.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const {data,error}=await s.from("content_calendar").select("*,content_research_briefs(*),content_scripts(*)").eq("owner_id",user.id).order("scheduled_date",{ascending:true});
 if(error)return NextResponse.json({error:"Could not load calendar. Apply the Shorts publishing migration.",details:error.message},{status:500});
 return NextResponse.json({items:data??[]});
}
export async function POST(req:Request){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:a}=await s.auth.getUser();if(a||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 let b:unknown;try{b=await req.json()}catch{return NextResponse.json({error:"Invalid JSON."},{status:400})}
 const body=typeof b==="object"&&b!==null&&!Array.isArray(b)?b as Record<string,unknown>:{};
 const title=String(body.title??"").trim();if(!title)return NextResponse.json({error:"A video topic is required."},{status:400});
 const {data,error}=await s.from("content_calendar").insert({owner_id:user.id,title,opportunity_id:typeof body.opportunity_id==="string"?body.opportunity_id:null,scheduled_date:typeof body.scheduled_date==="string"?body.scheduled_date||null:null,format:"short",target_duration_seconds:55}).select("*").single();
 if(error)return NextResponse.json({error:"Could not create calendar item.",details:error.message},{status:500});
 return NextResponse.json({item:data});
}
