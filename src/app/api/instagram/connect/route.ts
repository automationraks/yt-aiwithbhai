import { NextRequest,NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const runtime="nodejs";
export async function GET(req:NextRequest){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});
 const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const id=process.env.META_APP_ID,redirect=process.env.META_REDIRECT_URI;if(!id||!process.env.META_APP_SECRET||!redirect)return NextResponse.json({error:"Configure META_APP_ID, META_APP_SECRET and META_REDIRECT_URI."},{status:503});
 const state=randomBytes(24).toString("hex");const url=new URL("https://www.facebook.com/v25.0/dialog/oauth");
 url.searchParams.set("client_id",id);url.searchParams.set("redirect_uri",redirect);url.searchParams.set("state",state);url.searchParams.set("response_type","code");
 url.searchParams.set("scope","pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights");
 const response=NextResponse.redirect(url);response.cookies.set("ig_oauth_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/instagram/callback",maxAge:600});return response;
}
