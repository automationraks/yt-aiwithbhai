import { NextRequest,NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const{data:{user},error:auth}=await db.auth.getUser();if(auth||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const{data,error}=await db.from("social_research_queue_history").select("id,platform,social_video_id,competitor_id,channel_id,channel_title,channel_url,video_id,video_title,video_url,thumbnail_url,selected_at").eq("owner_id",user.id).order("selected_at",{ascending:false}).limit(1).maybeSingle();
 if(error)return NextResponse.json({error:"Could not load Channel Preparation rotation. Apply migration 20261126000200 first.",details:error.message},{status:503});
 const{count}=await db.from("video_shortlists").select("id",{count:"exact",head:true}).eq("owner_id",user.id);
 const selection=data?{...data,isShortlisted:Boolean((await db.from("video_shortlists").select("id").eq("owner_id",user.id).eq("social_video_id",data.social_video_id??"00000000-0000-0000-0000-000000000000").maybeSingle()).data)}:null;
 const now=new Date(),next=new Date(now);next.setSeconds(0,0);next.setMinutes(Math.ceil((now.getMinutes()+1)/10)*10);
 return NextResponse.json({mode:"cloud",intervalMinutes:10,activeShortlistedChannels:count??0,selection,nextRefreshAt:next.toISOString(),message:selection?"A random stored shortlist video is selected every 10 minutes.":"No stored shortlist video is available yet. Add a YouTube or Instagram video to the Video Explorer shortlist."});
}
export async function POST(req:NextRequest){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const{data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 let b:Record<string,unknown>;try{b=await req.json()}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 if(b.action!=="shortlist")return NextResponse.json({error:"Unsupported action."},{status:400});
 const{data:pick,error:pickError}=await db.from("social_research_queue_history").select("*").eq("owner_id",user.id).order("selected_at",{ascending:false}).limit(1).maybeSingle();
 if(pickError||!pick)return NextResponse.json({error:"No selected video is available."},{status:404});
 const{data:video,error:videoError}=await db.from("social_videos").upsert({owner_id:user.id,platform:pick.platform,external_video_id:pick.video_id,source_channel_id:pick.channel_id,source_channel_name:pick.channel_title,source_channel_url:pick.channel_url,title:pick.video_title,permalink:pick.video_url,thumbnail_url:pick.thumbnail_url,is_custom_source:false,last_seen_at:new Date().toISOString()},{onConflict:"owner_id,platform,external_video_id"}).select("id").single();
 if(videoError||!video)return NextResponse.json({error:"Could not save selected video.",details:videoError?.message},{status:500});
 const{data:row,error}=await db.from("video_shortlists").upsert({owner_id:user.id,social_video_id:video.id,source_feature:"channel_preparation"},{onConflict:"owner_id,social_video_id",ignoreDuplicates:true}).select("id").maybeSingle();
 if(error)return NextResponse.json({error:"Could not save shortlist."},{status:500});
 return NextResponse.json({ok:true,alreadyShortlisted:!row,shortlist:row});
}
