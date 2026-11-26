import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";

type Snapshot={platform:string;snapshot_date:string;followers:number|null;subscribers:number|null;total_views:number|null;media_count:number|null;video_count:number|null;recent_views:number|null;recent_likes:number|null;recent_comments:number|null;engagement_rate:number|null};
const n=(v:number|null|undefined)=>Number(v??0);
function summarize(rows:Snapshot[],platform:"youtube"|"instagram"){
 const items=rows.filter(x=>x.platform===platform).sort((a,b)=>a.snapshot_date.localeCompare(b.snapshot_date));
 if(!items.length)return {available:false,platform,history:[],current:null,previous:null,change:null};
 const current=items[items.length-1],previous=items.length>1?items[0]:null;
 const metric=platform==="youtube"?"subscribers":"followers";
 const currentAudience=n(current[metric]),previousAudience=previous?n(previous[metric]):null;
 const currentViews=n(current.total_views),previousViews=previous?n(previous.total_views):null;
 return {available:true,platform,history:items,current:{date:current.snapshot_date,audience:currentAudience,totalViews:currentViews,mediaCount:n(current.media_count),videoCount:n(current.video_count),recentViews:n(current.recent_views),recentLikes:n(current.recent_likes),recentComments:n(current.recent_comments),engagementRate:n(current.engagement_rate)},previous:previous?{date:previous.snapshot_date,audience:previousAudience,totalViews:previousViews}:null,change:previous?{audience:currentAudience-previousAudience!,audiencePercent:previousAudience?((currentAudience-previousAudience!)/previousAudience)*100:null,totalViews:currentViews-previousViews!}:null};
}
export async function GET(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const since=new Date();since.setDate(since.getDate()-35);
 const {data:snapshots,error}=await db.from("channel_metric_snapshots").select("platform,snapshot_date,followers,subscribers,total_views,media_count,video_count,recent_views,recent_likes,recent_comments,engagement_rate").eq("owner_id",user.id).gte("snapshot_date",since.toISOString().slice(0,10)).order("snapshot_date",{ascending:true});
 if(error)return NextResponse.json({error:"Could not load channel history. Apply migration 20261126000500_channel_growth_intelligence.sql.",details:error.message},{status:500});
 const rows=(snapshots??[]) as Snapshot[];
 const youtube=summarize(rows,"youtube"),instagram=summarize(rows,"instagram");
 const latestDate=rows.length?rows[rows.length-1].snapshot_date:null;
 const weekly={start:new Date(Date.now()-7*86400000).toISOString().slice(0,10),end:new Date().toISOString().slice(0,10),youtube,instagram};
 return NextResponse.json({snapshots:rows,weekly,latestSnapshotDate:latestDate,historyDays:35});
}
export async function POST(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const {data,error}=await db.from("channel_weekly_reports").select("id,week_start,week_end,report,generated_at").eq("owner_id",user.id).order("week_start",{ascending:false}).limit(12);
 if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({reports:data??[]});
}
