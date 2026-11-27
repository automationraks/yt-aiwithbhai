import {NextResponse} from "next/server";
import {timingSafeEqual} from "node:crypto";
import {createSupabaseAdminClient} from "@/lib/auth/session";
import {decryptPlatformToken,encryptPlatformToken} from "@/lib/platform-token-crypto";
export const runtime="nodejs";export const dynamic="force-dynamic";
function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
async function refreshYouTube(db:ReturnType<typeof createSupabaseAdminClient>,row:Record<string,unknown>){
 const refresh=row.encrypted_refresh_token?decryptPlatformToken(String(row.encrypted_refresh_token)):"";
 if(!refresh)throw new Error("YouTube refresh token missing; reconnect the channel with consent.");
 const clientId=process.env.YOUTUBE_OAUTH_CLIENT_ID,clientSecret=process.env.YOUTUBE_OAUTH_CLIENT_SECRET;if(!clientId||!clientSecret)throw new Error("YouTube OAuth client credentials are missing.");
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refresh,grant_type:"refresh_token"}),cache:"no-store",signal:AbortSignal.timeout(15000)});
 const data=await response.json() as {access_token?:string;expires_in?:number;error_description?:string};if(!response.ok||!data.access_token)throw new Error(data.error_description||"YouTube token refresh failed.");
 const encrypted=encryptPlatformToken(data.access_token);await db.from("youtube_connections").update({encrypted_access_token:encrypted,token_expires_at:data.expires_in?new Date(Date.now()+data.expires_in*1000).toISOString():null,connection_status:"connected",updated_at:new Date().toISOString()}).eq("id",row.id);
 return data.access_token;
}
export async function POST(req:Request){
 const secret=process.env.N8N_PUBLISHING_CALLBACK_SECRET;if(!secret)return NextResponse.json({error:"Publishing service secret is not configured."},{status:503});
 const supplied=req.headers.get("x-publishing-callback-secret")??"";if(!safeEqual(secret,supplied))return NextResponse.json({error:"Unauthorized."},{status:401});
 let body:{ownerId?:unknown;workspaceId?:unknown;platform?:unknown};try{body=await req.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 if(typeof body.ownerId!=="string"||typeof body.workspaceId!=="string"||(body.platform!=="youtube"&&body.platform!=="instagram"))return NextResponse.json({error:"ownerId, workspaceId and valid platform are required."},{status:400});
 const db=createSupabaseAdminClient();const {data:workspace}=await db.from("channel_workspaces").select("id").eq("id",body.workspaceId).eq("owner_id",body.ownerId).eq("is_active",true).maybeSingle();if(!workspace)return NextResponse.json({error:"Workspace not found."},{status:404});
 try{
  if(body.platform==="youtube"){
   const {data:row,error}=await db.from("youtube_connections").select("*").eq("owner_id",body.ownerId).eq("workspace_id",body.workspaceId).maybeSingle();if(error||!row)return NextResponse.json({error:"YouTube account is not connected for this workspace."},{status:404});
   let token=decryptPlatformToken(row.encrypted_access_token);if(!row.token_expires_at||Date.parse(row.token_expires_at)<Date.now()+60000)token=await refreshYouTube(db,row);
   return NextResponse.json({platform:"youtube",accessToken:token,channelId:row.channel_id});
  }
  const {data:row,error}=await db.from("instagram_connections").select("*").eq("owner_id",body.ownerId).eq("workspace_id",body.workspaceId).maybeSingle();if(error||!row)return NextResponse.json({error:"Instagram account is not connected for this workspace."},{status:404});
  if(row.token_expires_at&&Date.parse(row.token_expires_at)<Date.now()+86400000)return NextResponse.json({error:"Instagram Page token is expiring; reconnect the Instagram account."},{status:409});
  return NextResponse.json({platform:"instagram",accessToken:decryptPlatformToken(row.encrypted_page_access_token),instagramUserId:row.instagram_user_id,pageId:row.facebook_page_id});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Credential lookup failed."},{status:502});}
}
