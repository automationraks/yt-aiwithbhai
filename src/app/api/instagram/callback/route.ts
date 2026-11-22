import { NextRequest,NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/instagram/crypto";
export const runtime="nodejs";
const version=()=>process.env.META_GRAPH_VERSION||"v25.0";
async function graph(path:string,params:Record<string,string>){const u=new URL("https://graph.facebook.com/"+version()+"/"+path);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));const r=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(20000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||"Meta Graph API request failed.");return d;}
export async function GET(req:NextRequest){
 const base=new URL("/instagram",req.url);const fail=(message:string)=>{base.searchParams.set("error",message.slice(0,240));const r=NextResponse.redirect(base);r.cookies.delete("ig_oauth_state");return r;};
 const state=req.nextUrl.searchParams.get("state"),cookie=req.cookies.get("ig_oauth_state")?.value,code=req.nextUrl.searchParams.get("code");
 if(!state||!cookie||state!==cookie)return fail("Instagram authorization state did not match. Please connect again.");
 if(req.nextUrl.searchParams.get("error"))return fail(req.nextUrl.searchParams.get("error_description")||"Instagram authorization was cancelled.");
 if(!code)return fail("Meta did not return an authorization code.");
 const s=await createSupabaseServerClient();if(!s)return fail("Supabase is not configured.");const {data:{user}}=await s.auth.getUser();if(!user)return fail("Your session expired. Sign in and connect again.");
 try{
  const appId=process.env.META_APP_ID!,secret=process.env.META_APP_SECRET!,redirect=process.env.META_REDIRECT_URI!;
  const token=await graph("oauth/access_token",{client_id:appId,client_secret:secret,redirect_uri:redirect,code});
  const long=await graph("oauth/access_token",{grant_type:"fb_exchange_token",client_id:appId,client_secret:secret,fb_exchange_token:String(token.access_token)});
  const pages=await graph("me/accounts",{fields:"id,name,access_token,instagram_business_account{id,username}",access_token:String(long.access_token)});
  const page=(pages.data??[]).find((p:{instagram_business_account?:{id?:string;username?:string}})=>p.instagram_business_account?.id&&p.instagram_business_account?.username);
  if(!page)throw new Error("No linked Instagram Business or Creator account was found. Link your professional Instagram account to a Facebook Page and retry.");
  const ig=page.instagram_business_account;
  const {error}=await s.from("instagram_connections").upsert({owner_id:user.id,instagram_user_id:ig.id,instagram_username:ig.username,facebook_page_id:page.id,facebook_page_name:page.name??null,encrypted_page_access_token:encryptToken(String(page.access_token)),token_expires_at:long.expires_in?new Date(Date.now()+Number(long.expires_in)*1000).toISOString():null,scopes:["pages_show_list","pages_read_engagement","instagram_basic","instagram_manage_insights"],updated_at:new Date().toISOString()},{onConflict:"owner_id"});
  if(error)throw new Error("Could not securely save Instagram connection: "+error.message);
  base.searchParams.set("connected","1");
 }catch(e){base.searchParams.set("error",e instanceof Error?e.message:"Instagram connection failed.");}
 const response=NextResponse.redirect(base);response.cookies.delete("ig_oauth_state");return response;
}
