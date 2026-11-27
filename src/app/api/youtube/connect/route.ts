import {NextResponse} from "next/server";
import {randomBytes} from "node:crypto";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {getActiveWorkspace} from "@/lib/workspaces/context";
export const runtime="nodejs";
export async function GET(){
 const db=await createSupabaseServerClient();if(!db)return NextResponse.json({error:"Supabase is unavailable."},{status:503});
 const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 const ws=await getActiveWorkspace(db,user.id);if(!ws)return NextResponse.json({error:"Create a workspace first."},{status:409});
 const clientId=process.env.YOUTUBE_OAUTH_CLIENT_ID,redirect=process.env.YOUTUBE_OAUTH_REDIRECT_URI;
 if(!clientId||!redirect)return NextResponse.json({error:"Configure YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_REDIRECT_URI."},{status:503});
 const state=randomBytes(32).toString("hex");const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 url.searchParams.set("client_id",clientId);url.searchParams.set("redirect_uri",redirect);url.searchParams.set("response_type","code");
 url.searchParams.set("scope","https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly");
 url.searchParams.set("access_type","offline");url.searchParams.set("prompt","consent");url.searchParams.set("include_granted_scopes","true");url.searchParams.set("state",state);
 const response=NextResponse.redirect(url);response.cookies.set("yt_oauth_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/youtube/callback",maxAge:600});
 response.cookies.set("yt_oauth_workspace",ws.id,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/youtube/callback",maxAge:600});return response;
}
