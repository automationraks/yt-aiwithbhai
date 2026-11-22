import { NextRequest,NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/instagram/crypto";
export const runtime="nodejs";export const dynamic="force-dynamic";
const ver=()=>process.env.META_GRAPH_VERSION||"v25.0";
async function meta(path:string,token:string,fields:string){const u=new URL("https://graph.facebook.com/"+ver()+"/"+path);u.searchParams.set("fields",fields);u.searchParams.set("access_token",token);const r=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(20000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||"Instagram Business Discovery failed.");return d;}
export async function GET(){const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized."},{status:401});const {data,error}=await s.from("instagram_content_sources").select("*").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(100);if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({sources:data??[]});}
export async function POST(req:NextRequest){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase is not configured."},{status:503});const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized."},{status:401});
 let body:{username?:unknown};try{body=await req.json();}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 const username=String(body.username??"").trim().replace(/^@/,"").toLowerCase();if(!/^[a-z0-9._]{1,30}$/.test(username))return NextResponse.json({error:"Enter a valid Instagram username, without the @."},{status:400});
 const {data:connection,error:ce}=await s.from("instagram_connections").select("instagram_user_id,encrypted_page_access_token").eq("owner_id",user.id).maybeSingle();if(ce)return NextResponse.json({error:ce.message},{status:500});if(!connection)return NextResponse.json({error:"Connect your Instagram professional account first."},{status:409});
 try{
  const token=decryptToken(connection.encrypted_page_access_token);
  const own=await meta(connection.instagram_user_id,token,"username");
  const target=username===String(own.username).toLowerCase()?null:username;
  const fields=target?("business_discovery.username("+target+"){username,name,biography,website,followers_count,media_count,media.limit(12){id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp,like_count,comments_count}}"):"username,name,biography,website,followers_count,media_count,media.limit(12){id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp,like_count,comments_count}";
  const result=await meta(connection.instagram_user_id,token,fields);
  const profile=target?result.business_discovery:result;
  if(!profile?.username)throw new Error("Meta could not access this profile. It must be a public Business or Creator account and your app must have the required approved permissions.");
  const media=profile.media?.data??[];
  const rows=media.filter((m:{id?:string;permalink?:string})=>m.id&&m.permalink).map((m:{id:string;permalink:string;caption?:string;media_type?:string;media_product_type?:string;thumbnail_url?:string;timestamp?:string;like_count?:number;comments_count?:number})=>({owner_id:user.id,instagram_media_id:m.id,source_username:profile.username,source_name:profile.name??null,media_type:m.media_type??null,permalink:m.permalink,caption:m.caption??null,thumbnail_url:m.thumbnail_url??null,timestamp:m.timestamp??null,like_count:m.like_count??null,comments_count:m.comments_count??null,media_product_type:m.media_product_type??null}));
  if(rows.length){const {error}=await s.from("instagram_content_sources").upsert(rows,{onConflict:"owner_id,instagram_media_id"});if(error)throw new Error("Could not save Instagram source posts: "+error.message);}
  const {data:sources}=await s.from("instagram_content_sources").select("*").eq("owner_id",user.id).eq("source_username",profile.username).order("timestamp",{ascending:false}).limit(20);
  return NextResponse.json({profile:{username:profile.username,name:profile.name??null,biography:profile.biography??null,followers:profile.followers_count??null,mediaCount:profile.media_count??null},saved:rows.length,sources:sources??[],note:"Only media returned by Meta for eligible professional accounts is shown. No video files are downloaded."});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Instagram discovery failed."},{status:502});}
}
