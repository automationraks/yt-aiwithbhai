import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/auth/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
function istParts(date: Date) {
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
 const get=(type:string)=>parts.find(part=>part.type===type)?.value??"";
 return {date:get("year")+"-"+get("month")+"-"+get("day"),time:get("hour")+":"+get("minute")};
}
function minutes(value:string){const[h,m]=value.split(":").map(Number);return h*60+m;}
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const webhook=process.env.N8N_DAILY_CONTENT_WEBHOOK_URL;
 if(!webhook)return NextResponse.json({error:"N8N_DAILY_CONTENT_WEBHOOK_URL is not configured."},{status:503});
 const db=createSupabaseAdminClient();
 const {data:schedules,error}=await db.from("automation_schedules").select("id,owner_id,schedule_time,enabled").eq("schedule_key","daily_content_research").eq("enabled",true);
 if(error)return NextResponse.json({error:"Could not read schedules. Apply the automation schedule migration first.",details:error.message},{status:500});
 const now=new Date(),local=istParts(now),currentMinute=minutes(local.time),dispatched:string[]=[],failed:Array<{id:string;error:string}>=[];
 for(const schedule of schedules??[]){
  const {data:controls}=await db.from("operations_controls").select("control_key,enabled").eq("owner_id",schedule.owner_id).in("control_key",["research_automation","content_generation"]);
  if((controls??[]).some(x=>x.enabled===false))continue;
  const targetMinute=minutes(schedule.schedule_time);
  if(currentMinute<targetMinute||currentMinute>targetMinute+5)continue;
  const {data:claimed,error:claimError}=await db.rpc("claim_daily_content_schedule",{p_schedule_id:schedule.id,p_local_date:local.date});
  if(claimError)return NextResponse.json({error:"Could not claim schedule dispatch.",details:claimError.message},{status:500});
  if(!claimed)continue;
  try{
   const response=await fetch(webhook,{method:"POST",headers:{"Content-Type":"application/json",...(process.env.N8N_WEBHOOK_SECRET?{"x-webhook-secret":process.env.N8N_WEBHOOK_SECRET}:{})},body:JSON.stringify({event:"daily_content_research",brand:"AIWithBh@i",niche:"Practical AI engineering, AI systems and automation",scheduledAt:now.toISOString(),timezone:"Asia/Kolkata",configuredTime:schedule.schedule_time,ownerId:schedule.owner_id,output:{platforms:["youtube_shorts","instagram_reels"],aspectRatio:"9:16",minimumDurationSeconds:30,maximumDurationSeconds:60,durationBands:{simple:[30,40],medium:[40,50],complex:[50,60]},requireManualApprovalBeforeVideoProduction:true,requireManualApprovalBeforePublishing:true}}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error("n8n webhook returned HTTP "+response.status+": "+(await response.text()).slice(0,500));
   const {error:updateError}=await db.from("automation_schedules").update({last_dispatched_on:local.date,dispatching_on:null,updated_at:new Date().toISOString()}).eq("id",schedule.id);
   if(updateError)throw new Error("Dispatched but could not mark schedule complete: "+updateError.message);
   dispatched.push(schedule.id);
  }catch(err){await db.from("automation_schedules").update({dispatching_on:null,updated_at:new Date().toISOString()}).eq("id",schedule.id);failed.push({id:schedule.id,error:err instanceof Error?err.message:"Dispatch failed."});}
 }
 return NextResponse.json({ok:failed.length===0,timezone:"Asia/Kolkata",localDate:local.date,localTime:local.time,checked:schedules?.length??0,dispatched:dispatched.length,dispatchedScheduleIds:dispatched,failed,nextAction:dispatched.length?"Daily research webhook dispatched.":"No schedule was due in this five-minute window."});
}
