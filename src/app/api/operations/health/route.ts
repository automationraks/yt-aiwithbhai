import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAIConfiguration } from "@/lib/ai/provider";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(){
 const db=await createSupabaseServerClient();
 if(!db)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const checks:Array<{key:string;status:"ok"|"warning"|"error";detail:string}>=[];
 const tables=["workflow_event_logs","ai_usage_logs","publishing_targets","operations_controls"];
 const results=await Promise.all(tables.map(async table=>{
  const {error}=await db.from(table).select("id",{head:true,count:"exact"}).limit(1);
  return {table,error};
 }));
 for(const item of results)checks.push({key:item.table,status:item.error?"error":"ok",detail:item.error?.message??"Database table is reachable."});
 const ai=getAIConfiguration();
 checks.push({key:"gemini",status:process.env.GEMINI_API_KEY?"ok":"warning",detail:process.env.GEMINI_API_KEY?"Gemini API key is configured.":"Gemini API key is missing."});
 checks.push({key:"groq",status:process.env.GROQ_API_KEY?"ok":"warning",detail:process.env.GROQ_API_KEY?"Groq fallback key is configured.":"Groq fallback key is not configured."});
 checks.push({key:"n8n",status:process.env.N8N_BASE_URL&&process.env.N8N_WEBHOOK_SECRET?"ok":"warning",detail:process.env.N8N_BASE_URL&&process.env.N8N_WEBHOOK_SECRET?"n8n environment variables are present.":"n8n environment configuration is incomplete."});
 checks.push({key:"youtube",status:process.env.YOUTUBE_API_KEY?"ok":"warning",detail:process.env.YOUTUBE_API_KEY?"YouTube API key is configured.":"YouTube API key is missing."});
 checks.push({key:"ai_configuration",status:ai.configured?"ok":"warning",detail:ai.configured?"AI provider configuration is available.":"No usable AI provider is configured."});
 if(process.env.RENDERER_HEALTH_URL){
  try{const response=await fetch(process.env.RENDERER_HEALTH_URL,{signal:AbortSignal.timeout(5000),cache:"no-store"});checks.push({key:"renderer",status:response.ok?"ok":"error",detail:response.ok?"Renderer health endpoint responded.":`Renderer returned HTTP ${response.status}.`});}
  catch{checks.push({key:"renderer",status:"error",detail:"Renderer health endpoint did not respond."});}
 }else checks.push({key:"renderer",status:"warning",detail:"RENDERER_HEALTH_URL is not configured; worker status cannot be checked remotely."});
 return NextResponse.json({checks,checkedAt:new Date().toISOString(),summary:{healthy:checks.filter(x=>x.status==="ok").length,warnings:checks.filter(x=>x.status==="warning").length,errors:checks.filter(x=>x.status==="error").length}});
}
