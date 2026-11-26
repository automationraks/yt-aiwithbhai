import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/auth/session";
import { decryptToken } from "@/lib/instagram/crypto";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const localDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
async function youtubeSnapshot(){
 const key=process.env.YOUTUBE_API_KEY;if(!key)throw new Error("YOUTUBE_API_KEY is not configured.");
 const base="https://www.googleapis.com/youtube/v3/";
 const channelUrl=new URL(base+"channels");channelUrl.search=new URLSearchParams({part:"snippet,statistics,contentDetails",forHandle:"AiWithBhai-ytb",key}).toString();
 const cr=await fetch(channelUrl,{cache:"no-store",signal:AbortSignal.timeout(15000)});const cd=await cr.json();if(!cr.ok)throw new Error(cd.error?.message||"YouTube channel request failed.");
 const channel=cd.items?.[0];if(!channel)throw new Error("YouTube channel @AiWithBhai-ytb not found.");
 const playlistId=channel.contentDetails?.relatedPlaylists?.uploads;let recentViews=0,recentLikes=0,recentComments=0;
 if(playlistId){const pu=new URL(base+"playlistItems");pu.search=new URLSearchParams({part:"contentDetails",playlistId,maxResults:"10",key}).toString();const pr=await fetch(pu,{cache:"no-store",signal:AbortSignal.timeout(15000)});const pd=await pr.json();if(!pr.ok)throw new Error(pd.error?.message||"YouTube uploads request failed.");const ids=(pd.items??[]).map((x:{contentDetails?:{videoId?:string}})=>x.contentDetails?.videoId).filter(Boolean);if(ids.length){const vu=new URL(base+"videos");vu.search=new URLSearchParams({part:"statistics",id:ids.join(","),key}).toString();const vr=await fetch(vu,{cache:"no-store",signal:AbortSignal.timeout(15000)});const vd=await vr.json();if(!vr.ok)throw new Error(vd.error?.message||"YouTube video stats failed.");for(const v of vd.items??[]){recentViews+=Number(v.statistics?.viewCount??0);recentLikes+=Number(v.statistics?.likeCount??0);recentComments+=Number(v.statistics?.commentCount??0);}}}
 const st=channel.statistics??{};return {subscribers:Number(st.subscriberCount??0),total_views:Number(st.viewCount??0),video_count:Number(st.videoCount??0),media_count:Number(st.videoCount??0),recent_views:recentViews,recent_likes:recentLikes,recent_comments:recentComments,engagement_rate:recentViews?((recentLikes+recentComments)/recentViews)*100:0,metadata:{channel_id:channel.id}};
}
async function instagramSnapshot(db:ReturnType<typeof createSupabaseAdminClient>,ownerId:string){
 const {data,error}=await db.from("instagram_connections").select("instagram_username,instagram_user_id,encrypted_page_access_token,token_expires_at").eq("owner_id",ownerId).maybeSingle();
 if(error)throw new Error(error.message);if(!data?.instagram_user_id||!data.encrypted_page_access_token)return null;
 if(data.token_expires_at&&new Date(data.token_expires_at).getTime()<Date.now())throw new Error("Instagram token expired.");
 const token=decryptToken(data.encrypted_page_access_token),version=process.env.META_GRAPH_VERSION||"v25.0";
 const url=new URL("https://graph.facebook.com/"+version+"/"+data.instagram_user_id);url.searchParams.set("fields","username,followers_count,media_count,media.limit(10){id,media_type,like_count,comments_count}");url.searchParams.set("access_token",token);
 const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok)throw new Error(result.error?.message||"Instagram Graph API request failed.");
 const media=result.media?.data??[];const views=media.reduce((sum:number,x:{view_count?:number})=>sum+Number(x.view_count??0),0),likes=media.reduce((sum:number,x:{like_count?:number})=>sum+Number(x.like_count??0),0),comments=media.reduce((sum:number,x:{comments_count?:number})=>sum+Number(x.comments_count??0),0);
 return {followers:Number(result.followers_count??0),media_count:Number(result.media_count??0),recent_views:views,recent_likes:likes,recent_comments:comments,engagement_rate:views?((likes+comments)/views)*100:0,metadata:{username:result.username??data.instagram_username}};
}
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;if(!secret||request.headers.get("authorization")!== "Bearer "+secret)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=createSupabaseAdminClient(),date=localDate();const {data:users,error}=await db.from("app_users").select("id");
 if(error)return NextResponse.json({error:"Could not load account owners.",details:error.message},{status:500});
 let yt:Awaited<ReturnType<typeof youtubeSnapshot>>|null=null,ytError:string|null=null;try{yt=await youtubeSnapshot()}catch(e){ytError=e instanceof Error?e.message:"YouTube snapshot failed."}
 const saved:string[]=[],failed:Array<{ownerId:string;platform:string;error:string}>=[];
 for(const user of users??[]){
  if(yt){const {error:e}=await db.from("channel_metric_snapshots").upsert({owner_id:user.id,platform:"youtube",snapshot_date:date,...yt,source:"scheduled_live_api"},{onConflict:"owner_id,platform,snapshot_date"});if(e)failed.push({ownerId:user.id,platform:"youtube",error:e.message});else saved.push(user.id+":youtube");}
  try{const ig=await instagramSnapshot(db,user.id);if(ig){const {error:e}=await db.from("channel_metric_snapshots").upsert({owner_id:user.id,platform:"instagram",snapshot_date:date,...ig,source:"scheduled_live_api"},{onConflict:"owner_id,platform,snapshot_date"});if(e)throw e;saved.push(user.id+":instagram");}}catch(e){failed.push({ownerId:user.id,platform:"instagram",error:e instanceof Error?e.message:"Instagram snapshot failed."});}
 }
 if(ytError)for(const user of users??[])failed.push({ownerId:user.id,platform:"youtube",error:ytError});
 return NextResponse.json({ok:failed.length===0,date,owners:users?.length??0,saved:saved.length,failed});
}
