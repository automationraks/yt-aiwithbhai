import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Snapshot={platform:string;snapshot_date:string;followers:number|null;subscribers:number|null;total_views:number|null;media_count:number|null;video_count:number|null;recent_views:number|null;recent_likes:number|null;recent_comments:number|null;engagement_rate:number|null};
const value=(v:number|null|undefined)=>Number(v??0);
const date=(d:Date)=>d.toISOString().slice(0,10);
function trend(rows:Snapshot[],platform:"youtube"|"instagram",from:string,to:string){
 const list=rows.filter(x=>x.platform===platform&&x.snapshot_date>=from&&x.snapshot_date<=to).sort((a,b)=>a.snapshot_date.localeCompare(b.snapshot_date));
 if(!list.length)return {available:false,platform,days:0,currentAudience:null,audienceChange:null,audienceChangePercent:null,totalViews:value(null),recentViews:0,recentLikes:0,recentComments:0,engagementRate:0,history:[]};
 const first=list[0],last=list[list.length-1],audienceKey=platform==="youtube"?"subscribers":"followers";
 const startAudience=value(first[audienceKey]),endAudience=value(last[audienceKey]);
 const recentViews=list.reduce((s,x)=>s+value(x.recent_views),0),recentLikes=list.reduce((s,x)=>s+value(x.recent_likes),0),recentComments=list.reduce((s,x)=>s+value(x.recent_comments),0);
 return {available:true,platform,days:list.length,currentAudience:endAudience,audienceChange:endAudience-startAudience,audienceChangePercent:startAudience?((endAudience-startAudience)/startAudience)*100:null,totalViews:value(last.total_views)-value(first.total_views),recentViews,recentLikes,recentComments,engagementRate:recentViews?((recentLikes+recentComments)/recentViews)*100:0,history:list};
}
async function auth(){
 const db=await createSupabaseServerClient();if(!db)return {error:NextResponse.json({error:"Supabase is not configured."},{status:503})};
 const {data:{user},error}=await db.auth.getUser();if(error||!user)return {error:NextResponse.json({error:"Unauthorized."},{status:401})};return {db,user};
}
export async function GET(){
 const a=await auth();if(a.error)return a.error;
 const now=new Date(),from=new Date(now.getTime()-35*86400000),weekStart=new Date(now.getTime()-7*86400000),previousStart=new Date(now.getTime()-14*86400000);
 const {data:snapshots,error}=await a.db.from("channel_metric_snapshots").select("platform,snapshot_date,followers,subscribers,total_views,media_count,video_count,recent_views,recent_likes,recent_comments,engagement_rate").eq("owner_id",a.user.id).gte("snapshot_date",date(from)).order("snapshot_date",{ascending:true});
 if(error)return NextResponse.json({error:"Could not load channel history. Apply migration 20261126000500_channel_growth_intelligence.sql.",details:error.message},{status:500});
 const rows=(snapshots??[]) as Snapshot[];
 const current={youtube:trend(rows,"youtube",date(weekStart),date(now)),instagram:trend(rows,"instagram",date(weekStart),date(now))};
 const previous={youtube:trend(rows,"youtube",date(previousStart),date(weekStart)),instagram:trend(rows,"instagram",date(previousStart),date(weekStart))};
 const {data:reports, error:reportError}=await a.db.from("channel_weekly_reports").select("id,week_start,week_end,report,generated_at").eq("owner_id",a.user.id).order("week_start",{ascending:false}).limit(8);
 return NextResponse.json({snapshots:rows,current,previous,reports:reportError?[]:reports??[],reportWarning:reportError?"Weekly report table unavailable. Apply the channel growth intelligence migration.":null,period:{start:date(weekStart),end:date(now),previousStart:date(previousStart),previousEnd:date(weekStart)}});
}
export async function POST(){
 const a=await auth();if(a.error)return a.error;
 const now=new Date(),start=new Date(now.getTime()-7*86400000),prevStart=new Date(now.getTime()-14*86400000);
 const {data:snapshots,error}=await a.db.from("channel_metric_snapshots").select("platform,snapshot_date,followers,subscribers,total_views,recent_views,recent_likes,recent_comments").eq("owner_id",a.user.id).gte("snapshot_date",date(prevStart)).order("snapshot_date",{ascending:true});
 if(error)return NextResponse.json({error:"Could not build report from snapshots. Apply the channel growth intelligence migration and refresh Channel Analytics daily."},{status:500});
 const rows=(snapshots??[]) as Snapshot[];
 const current={youtube:trend(rows,"youtube",date(start),date(now)),instagram:trend(rows,"instagram",date(start),date(now))};
 const previous={youtube:trend(rows,"youtube",date(prevStart),date(start)),instagram:trend(rows,"instagram",date(prevStart),date(start))};
 const recommendations:string[]=[];
 for(const platform of ["youtube","instagram"] as const){
  const c=current[platform],p=previous[platform];
  if(!c.available){recommendations.push("Collect more "+platform+" daily snapshots before interpreting weekly growth.");continue;}
  if(c.audienceChange!==null&&c.audienceChange<0)recommendations.push(platform+": audience declined; review recent topics, posting consistency and audience feedback.");
  else if(c.audienceChange!==null&&c.audienceChange>0)recommendations.push(platform+": audience increased by "+c.audienceChange+"; identify which recent posts drove profile visits and follows.");
  if(c.engagementRate>0)recommendations.push(platform+": recent interaction rate is "+c.engagementRate.toFixed(2)+"%; compare the strongest posts and repeat their topic and opening structure.");
  if(p.available&&p.recentViews>0&&c.recentViews<p.recentViews)recommendations.push(platform+": recent views are lower than the previous 7-day snapshot total; test a different hook and review publishing cadence.");
 }
 if(!recommendations.length)recommendations.push("Continue collecting daily snapshots. The system needs multiple days of history before it can identify meaningful trends.");
 let aiGenerated=false,aiProvider:string|null=null;
 const prompt="You are a cautious social media growth analyst. Analyze this JSON of first-party YouTube and Instagram account snapshots. Return ONLY JSON with keys summary (string) and recommendations (array of 3 to 5 concise strings). Do not invent metrics, causation, reach, impressions, watch time or audience retention. Distinguish missing data from zero. Make practical experiments, not guarantees. Data: "+JSON.stringify({current,previous});
 try {
  if(process.env.GEMINI_API_KEY){
   const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";
   const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent?key="+process.env.GEMINI_API_KEY,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.3}}),signal:AbortSignal.timeout(20000)});
   const result=await response.json();if(response.ok){const raw=result.candidates?.[0]?.content?.parts?.map((x:{text?:string})=>x.text??"").join("")??"";const parsed=JSON.parse(raw);if(typeof parsed.summary==="string"&&Array.isArray(parsed.recommendations)){recommendations.splice(0,recommendations.length,...parsed.recommendations.map(String).slice(0,5));aiGenerated=true;aiProvider="gemini";}}
  }
  if(!aiGenerated&&process.env.GROQ_API_KEY){
   const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+process.env.GROQ_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.GROQ_MODEL||"llama-3.3-70b-versatile",messages:[{role:"user",content:prompt}],temperature:0.3,response_format:{type:"json_object"}}),signal:AbortSignal.timeout(20000)});
   const result=await response.json();if(response.ok){const parsed=JSON.parse(result.choices?.[0]?.message?.content??"{}");if(typeof parsed.summary==="string"&&Array.isArray(parsed.recommendations)){recommendations.splice(0,recommendations.length,...parsed.recommendations.map(String).slice(0,5));aiGenerated=true;aiProvider="groq";}}
  }
 } catch { /* Retain deterministic, data-grounded recommendations when AI is unavailable. */ }
 const report={title:"Weekly Channel Growth Report",summary:aiGenerated?"AI analysis of the latest 7-day period compared with the preceding 7 days, grounded in stored account snapshots.":"Rule-based analysis of the latest 7-day period compared with the preceding 7 days. Configure Gemini or Groq to enable AI-written recommendations.",youtube:{current:current.youtube,previous:previous.youtube},instagram:{current:current.instagram,previous:previous.instagram},recommendations,generatedAt:now.toISOString(),generatedBy:aiGenerated?aiProvider:"rules_fallback",dataQuality:{snapshotCount:rows.length,minimumHistoryDays:2,limitations:["Reach, impressions, watch time and audience retention are not inferred when the connected APIs do not provide them.","Recent post metrics are sampled from the latest media returned by each platform, not a complete account-wide daily total."]}};
 const {data,error:saveError}=await a.db.from("channel_weekly_reports").upsert({owner_id:a.user.id,week_start:date(start),week_end:date(now),report,generated_at:now.toISOString()},{onConflict:"owner_id,week_start,week_end"}).select("id,week_start,week_end,report,generated_at").single();
 if(saveError)return NextResponse.json({error:"Could not save weekly report.",details:saveError.message},{status:500});
 return NextResponse.json({report:data});
}
