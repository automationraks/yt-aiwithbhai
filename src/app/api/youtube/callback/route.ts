import {NextRequest,NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {encryptPlatformToken} from "@/lib/platform-token-crypto";
export const runtime="nodejs";
type Token={access_token?:string;refresh_token?:string;expires_in?:number;error?:string;error_description?:string};
async function jsonFetch(url:string,init?:RequestInit){const r=await fetch(url,{...init,cache:"no-store",signal:AbortSignal.timeout(20000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error((d as Token).error_description||(d as Token).error||"Google OAuth request failed: HTTP "+r.status);return d as Record<string,unknown>;}
export async function GET(req:NextRequest){
 const dest=new URL("/publishing-connections",req.url);const fail=(msg:string)=>{dest.searchParams.set("youtube_error",msg.slice(0,220));const r=NextResponse.redirect(dest);r.cookies.delete("yt_oauth_state");r.cookies.delete("yt_oauth_workspace");return r;};
 const state=req.nextUrl.searchParams.get("state");if(!state||state!==req.cookies.get("yt_oauth_state")?.value)return fail("YouTube OAuth state did not match.");
 if(req.nextUrl.searchParams.get("error"))return fail(req.nextUrl.searchParams.get("error_description")||"YouTube authorization cancelled.");
 const code=req.nextUrl.searchParams.get("code");if(!code)return fail("Google did not return an authorization code.");
 const db=await createSupabaseServerClient();if(!db)return fail("Supabase unavailable.");const {data:{user}}=await db.auth.getUser();if(!user)return fail("Session expired.");
 const workspaceId=req.cookies.get("yt_oauth_workspace")?.value;if(!workspaceId)return fail("Workspace context expired.");
 const {data:ws}=await db.from("channel_workspaces").select("id").eq("id",workspaceId).eq("owner_id",user.id).eq("is_active",true).maybeSingle();if(!ws)return fail("Workspace not found.");
 try{
  const clientId=process.env.YOUTUBE_OAUTH_CLIENT_ID,clientSecret=process.env.YOUTUBE_OAUTH_CLIENT_SECRET,redirect=process.env.YOUTUBE_OAUTH_REDIRECT_URI;
  if(!clientId||!clientSecret||!redirect)throw new Error("YouTube OAuth environment is incomplete.");
  const token=await jsonFetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirect,grant_type:"authorization_code"})}) as Token;
  if(!token.access_token)throw new Error("Google did not return an access token.");
  const channel=await jsonFetch("https://www.googleapis.com/youtube/v3/channels?part=snippet%2Cid&mine=true",{headers:{Authorization:"Bearer "+token.access_token}});
  const item=(channel.items as Array<{id:string;snippet?:{title?:string;customUrl?:string}}> | undefined)?.[0];if(!item?.id)throw new Error("No YouTube channel was returned for this Google account.");
  const {error}=await db.from("youtube_connections").upsert({owner_id:user.id,workspace_id:workspaceId,channel_id:item.id,channel_title:item.snippet?.title??null,channel_handle:item.snippet?.customUrl??null,encrypted_access_token:encryptPlatformToken(token.access_token),encrypted_refresh_token:token.refresh_token?encryptPlatformToken(token.refresh_token):null,token_expires_at:token.expires_in?new Date(Date.now()+token.expires_in*1000).toISOString():null,scopes:["https://www.googleapis.com/auth/youtube.upload","https://www.googleapis.com/auth/youtube.readonly"],connection_status:"connected",last_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"workspace_id"});
  if(error)throw new Error("Could not save YouTube connection: "+error.message);
  dest.searchParams.set("youtube_connected","1");
 }catch(e){dest.searchParams.set("youtube_error",(e instanceof Error?e.message:"YouTube OAuth failed").slice(0,220));}
 const response=NextResponse.redirect(dest);response.cookies.delete("yt_oauth_state");response.cookies.delete("yt_oauth_workspace");return response;
}
