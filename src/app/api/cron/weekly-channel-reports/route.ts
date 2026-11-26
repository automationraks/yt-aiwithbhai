import { NextRequest,NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/auth/session";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
type Row={platform:string;snapshot_date:string;followers:number|null;subscribers:number|null;total_views:number|null;recent_views:number|null;recent_likes:number|null;recent_comments:number|null};
const date=(d:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
const n=(v:number|null)=>Number(v??0);
function summarize(rows:Row[],platform:"youtube"|"instagram",from:string,to:string){
 const list=rows.filter(x=>x.platform===platform&&x.snapshot_date>=from&&x.snapshot_date<=to).sort((a,b)=>a.snapshot_date.localeCompare(b.snapshot_date));
 if(!list.length)return {available:false,days:0,audienceChange:null as number|null,totalViews:0,recentViews:0,recentLikes:0,recentComments:0,engagementRate:0};
 const first=list[0],last=list[list.length-1],key=platform==="youtube"?"subscribers":"followers",start=n(first[key]),end=n(last[key]),views=n(last.recent_views),likes=n(last.recent_likes),comments=n(last.recent_comments);
 return {available:true,days:list.length,audienceChange:list.length>1?end-start:null,totalViews:platform==="youtube"?n(last.total_views)-n(first.total_views):0,recentViews:views,recentLikes:likes,recentComments:comments,engagementRate:views?(likes+comments)/views*100:0};
}
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;if(!secret||req.headers.get("authorization")!=="Bearer "+secret)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=createSupabaseAdminClient(),now=new Date(),end=date(now),start=date(new Date(now.getTime()-7*86400000)),previousStart=date(new Date(now.getTime()-14*86400000));
 const {data:users,error:userError}=await db.from("app_users").select("id");if(userError)return NextResponse.json({error:userError.message},{status:500});
 const generated:string[]=[],failed:Array<{ownerId:string;error:string}>=[];
 for(const user of users??[]){
  try{
   const {data,error}=await db.from("channel_metric_snapshots").select("platform,snapshot_date,followers,subscribers,total_views,recent_views,recent_likes,recent_comments").eq("owner_id",user.id).gte("snapshot_date",previousStart).lte("snapshot_date",end);
   if(error)throw error;const rows=(data??[]) as Row[];
   const current={youtube:summarize(rows,"youtube",start,end),instagram:summarize(rows,"instagram",start,end)};
   const previous={youtube:summarize(rows,"youtube",previousStart,start),instagram:summarize(rows,"instagram",previousStart,start)};
   const recommendations:string[]=[];
   for(const platform of ["youtube","instagram"] as const){const c=current[platform],p=previous[platform];if(!c.available){recommendations.push("Collect more daily "+platform+" snapshots before drawing growth conclusions.");continue;}if(c.audienceChange!==null)recommendations.push(platform+": audience change over the current period was "+c.audienceChange+". Review top posts and audience response before changing the content mix.");if(c.engagementRate>0)recommendations.push(platform+": latest sampled interaction rate was "+c.engagementRate.toFixed(2)+"%. Compare individual post performance before repeating formats.");if(p.available&&p.recentViews>0&&c.recentViews<p.recentViews)recommendations.push(platform+": latest sampled views are below the prior period sample; test alternative hooks and review publishing consistency.");}
   if(!recommendations.length)recommendations.push("Continue collecting daily snapshots to establish a reliable baseline.");
   let summary="Weekly comparison based on stored first-party channel snapshots.",generatedBy="rules_fallback";
   const prompt="Analyze this channel performance JSON. Return only JSON with summary string and recommendations array of 3-5 strings. Do not invent facts, infer causation, or claim guaranteed growth. State data limitations. "+JSON.stringify({current,previous});
   try{
    if(process.env.GEMINI_API_KEY){const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent?key="+process.env.GEMINI_API_KEY,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.3}}),signal:AbortSignal.timeout(18000)});const d=await r.json();if(r.ok){const raw=d.candidates?.[0]?.content?.parts?.map((x:{text?:string})=>x.text??"").join("")??"";const parsed=JSON.parse(raw);if(typeof parsed.summary==="string"&&Array.isArray(parsed.recommendations)){summary=parsed.summary;recommendations.splice(0,recommendations.length,...parsed.recommendations.map(String).slice(0,5));generatedBy="gemini";}}}
    if(generatedBy==="rules_fallback"&&process.env.GROQ_API_KEY){const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+process.env.GROQ_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.GROQ_MODEL||"llama-3.3-70b-versatile",messages:[{role:"user",content:prompt}],temperature:0.3,response_format:{type:"json_object"}}),signal:AbortSignal.timeout(18000)});const d=await r.json();if(r.ok){const parsed=JSON.parse(d.choices?.[0]?.message?.content??"{}");if(typeof parsed.summary==="string"&&Array.isArray(parsed.recommendations)){summary=parsed.summary;recommendations.splice(0,recommendations.length,...parsed.recommendations.map(String).slice(0,5));generatedBy="groq";}}}
   }catch{/* Keep factual rule-based report if provider is unavailable. */}
   const report={title:"Weekly Channel Growth Report",summary,youtube:{current:current.youtube,previous:previous.youtube},instagram:{current:current.instagram,previous:previous.instagram},recommendations,generatedAt:now.toISOString(),generatedBy,dataQuality:{snapshotCount:rows.length,limitations:["Instagram reach and impressions are not included unless explicitly returned by the connected API.","Latest media sample metrics are not full account-wide weekly totals."]}};
   const {error:saveError}=await db.from("channel_weekly_reports").upsert({owner_id:user.id,week_start:start,week_end:end,report,generated_at:now.toISOString()},{onConflict:"owner_id,week_start,week_end"});if(saveError)throw saveError;generated.push(user.id);
  }catch(e){failed.push({ownerId:user.id,error:e instanceof Error?e.message:"Weekly report generation failed."});}
 }
 return NextResponse.json({ok:failed.length===0,weekStart:start,weekEnd:end,owners:users?.length??0,generated:generated.length,failed});
}
