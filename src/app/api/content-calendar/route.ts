import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const{data:{user},error:authError}=await s.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const{data:calendar,error:calendarError}=await s.from("content_calendar").select("*").eq("owner_id",user.id).order("scheduled_date",{ascending:true});
 if(calendarError)return NextResponse.json({error:"Could not load content_calendar.",details:calendarError.message,code:calendarError.code,hint:calendarError.hint},{status:500});
 const ids=(calendar??[]).map(x=>x.id);
 const [briefsResult,scriptsResult,targetsResult]=await Promise.all([
  ids.length?s.from("content_research_briefs").select("*").eq("owner_id",user.id).in("calendar_id",ids).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
  ids.length?s.from("content_scripts").select("*").eq("owner_id",user.id).in("calendar_id",ids).order("version",{ascending:false}):Promise.resolve({data:[],error:null}),
  s.from("publishing_targets").select("*,content_ideas!inner(id,title,video_storage_path,video_production_status)").eq("owner_id",user.id).order("scheduled_at",{ascending:true})
 ]);
 if(briefsResult.error)return NextResponse.json({error:"Could not load research briefs.",details:briefsResult.error.message},{status:500});
 if(scriptsResult.error)return NextResponse.json({error:"Could not load scripts.",details:scriptsResult.error.message},{status:500});
 if(targetsResult.error)return NextResponse.json({error:"Could not load publishing targets. Apply migration 20261126000400 first.",details:targetsResult.error.message},{status:500});
 const items=(calendar??[]).map(item=>({...item,content_research_briefs:(briefsResult.data??[]).filter(x=>x.calendar_id===item.id),content_scripts:(scriptsResult.data??[]).filter(x=>x.calendar_id===item.id)}));
 const publishingItems=(targetsResult.data??[]).map(t=>({...t,title:(t.content_ideas as {title?:string}|null)?.title??"Short video",video_storage_path:(t.content_ideas as {video_storage_path?:string|null}|null)?.video_storage_path??null}));
 return NextResponse.json({items,publishingItems});
}
