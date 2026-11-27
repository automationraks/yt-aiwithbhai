import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
const KEYS = ["publishing_all","publishing_youtube","publishing_instagram","content_generation","research_automation"] as const;
type Key = typeof KEYS[number];
async function auth() {
  const db = await createSupabaseServerClient();
  if (!db) return { response: NextResponse.json({error:"Supabase is not configured."},{status:503}) };
  const {data:{user},error} = await db.auth.getUser();
  if (error || !user) return { response: NextResponse.json({error:"Unauthorized."},{status:401}) };
  return {db,user};
}
export async function GET() {
  const a=await auth(); if ("response" in a) return a.response;
  const defaults=KEYS.map(control_key=>({owner_id:a.user.id,control_key,enabled:true}));
  const {error:seedError}=await a.db.from("operations_controls").upsert(defaults,{onConflict:"owner_id,control_key",ignoreDuplicates:true});
  if(seedError) return NextResponse.json({error:"Could not initialize operational controls.",details:seedError.message},{status:500});
  const {data,error}=await a.db.from("operations_controls").select("control_key,enabled,updated_at").eq("owner_id",a.user.id);
  if(error)return NextResponse.json({error:"Could not load operational controls.",details:error.message},{status:500});
  return NextResponse.json({controls:data??[]});
}
export async function PUT(request:Request) {
  const a=await auth(); if ("response" in a) return a.response;
  let body: {controlKey?:unknown;enabled?:unknown};
  try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
  if(typeof body.controlKey!=="string"||!KEYS.includes(body.controlKey as Key)||typeof body.enabled!=="boolean")
    return NextResponse.json({error:"Provide a valid controlKey and boolean enabled value."},{status:400});
  const {data,error}=await a.db.from("operations_controls").upsert({
    owner_id:a.user.id,control_key:body.controlKey,enabled:body.enabled,updated_at:new Date().toISOString()
  },{onConflict:"owner_id,control_key"}).select("control_key,enabled,updated_at").single();
  if(error)return NextResponse.json({error:"Could not update operational control.",details:error.message},{status:500});
  return NextResponse.json({control:data});
}
