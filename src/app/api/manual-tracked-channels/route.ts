import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const API = "https://www.googleapis.com/youtube/v3";
const EXCLUDE = /\b(?:kids? channel|children'?s? channel|for kids|made for kids|nursery rhymes?|toy unboxing|preschool learning|baby songs?|stock market|share market|stock trading|share trading|trading channel|day trading|intraday trading|nifty|sensex|options trading|crypto trading|investment tips|stock tips)\b/i;
function parse(raw:string) {
 let u:URL; try{u=new URL(raw)}catch{return null}
 if(!["https:","http:"].includes(u.protocol))return null;
 const host=u.hostname.toLowerCase().replace(/^www\./,"");
 if(["youtube.com","m.youtube.com","youtu.be"].includes(host)){
  const p=u.pathname.split("/").filter(Boolean); if(!p.length)return null;
  let videoId:string|null=null,channelId:string|null=null,handle:string|null=null,username:string|null=null;
  if(host==="youtu.be")videoId=p[0];
  else if(p[0]==="watch")videoId=u.searchParams.get("v");
  else if(["shorts","live","embed"].includes(p[0]))videoId=p[1]??null;
  else if(p[0]==="channel")channelId=p[1]??null;
  else if(p[0].startsWith("@"))handle=p[0];
  else if(p[0]==="user")username=p[1]??null;
  else if(p[0]!=="c")return null;
  return {platform:"youtube" as const,url:u.toString(),videoId,channelId,handle,username};
 }
 if(["instagram.com","m.instagram.com"].includes(host)&&u.pathname!=="/")return {platform:"instagram" as const,url:u.toString(),videoId:null,channelId:null,handle:null,username:null};
 return null;
}
async function yt<T>(s:NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,resource:string,params:Record<string,string>):Promise<T>{
 const reservation=await s.rpc("reserve_youtube_quota",{p_bucket:"general",p_amount:1});if(reservation.error)throw new Error("YouTube quota tracker unavailable: "+reservation.error.message);if(!reservation.data?.allowed)throw new Error("YouTube general API quota exhausted. Try again after reset.");
 const key=process.env.YOUTUBE_API_KEY;if(!key)throw new Error("YOUTUBE_API_KEY is not configured.");
 const url=new URL(API+"/"+resource);Object.entries({...params,key}).forEach(([k,v])=>url.searchParams.set(k,v));
 const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(15000)});const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d?.error?.message||"YouTube API request failed.");return d as T;
}
async function resolve(s:NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,x:NonNullable<ReturnType<typeof parse>>){
 if(x.videoId){const v=await yt<{items?:Array<{snippet?:{channelId?:string}}>}>(s,"videos",{part:"snippet",id:x.videoId});const id=v.items?.[0]?.snippet?.channelId;if(!id)throw new Error("Could not resolve video to a public channel.");return id;}
 const p:Record<string,string>={part:"snippet,statistics,contentDetails",maxResults:"1"};
 if(x.channelId)p.id=x.channelId;else if(x.handle)p.forHandle=x.handle;else if(x.username)p.forUsername=x.username;else throw new Error("Custom /c/ URLs cannot be resolved. Use /channel/UC…, @handle, or a video URL.");
 const c=await yt<{items?:Array<{id:string}>}>(s,"channels",p);const id=c.items?.[0]?.id;if(!id)throw new Error("YouTube could not find that channel.");return id;
}
export async function GET(){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase unavailable"},{status:503});
 const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const{data,error}=await s.from("manual_tracked_channels").select("*").eq("owner_id",user.id).order("created_at",{ascending:false});
 if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({items:data??[]});
}
export async function POST(req:NextRequest){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase unavailable"},{status:503});
 const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 let b:Record<string,unknown>;try{b=await req.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
 const x=parse(String(b.url??"").trim());if(!x)return NextResponse.json({error:"Enter a valid public YouTube channel/video or Instagram profile/post URL."},{status:400});
 if(x.platform==="instagram"){
  const name=String(b.display_name??"").trim().slice(0,120)||new URL(x.url).pathname.split("/").filter(Boolean)[0]||"Instagram";
  const{data,error}=await s.from("manual_tracked_channels").upsert({owner_id:user.id,platform:"instagram",url:x.url,display_name:name,is_active:true,monitoring_status:"not_supported"},{onConflict:"owner_id,platform,url"}).select("*").single();
  if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({item:data,message:"Saved. Instagram monitoring is not integrated."});
 }
 try{
  const channelId=await resolve(s,x);
  const c=await yt<{items?:Array<{id:string;snippet?:{title?:string;description?:string;publishedAt?:string;country?:string;customUrl?:string};statistics?:{subscriberCount?:string;videoCount?:string;viewCount?:string}}>}>(s,"channels",{part:"snippet,statistics,contentDetails",id:channelId});
  const ch=c.items?.[0];if(!ch?.snippet?.title)throw new Error("Channel is private or unavailable.");
  if(EXCLUDE.test(ch.snippet.title+" "+(ch.snippet.description??"")))return NextResponse.json({error:"Blocked: channel metadata matches children's content or stock/share-market, trading or investment content."},{status:422});
  const now=new Date().toISOString(),title=ch.snippet.title;
  const existing=await s.from("competitors").select("ai_production_evidence").eq("owner_id",user.id).eq("youtube_channel_id",channelId).maybeSingle();
  const old=existing.data?.ai_production_evidence&&typeof existing.data.ai_production_evidence==="object"?existing.data.ai_production_evidence as Record<string,unknown>:{};
  const competitor={owner_id:user.id,youtube_channel_id:channelId,channel_title:title,channel_url:ch.snippet.customUrl?"https://www.youtube.com/@"+ch.snippet.customUrl.replace(/^@/,""):"https://www.youtube.com/channel/"+channelId,description:ch.snippet.description??null,published_at:ch.snippet.publishedAt??null,country:ch.snippet.country??null,language:"en",subscriber_count:ch.statistics?.subscriberCount??null,video_count:ch.statistics?.videoCount??null,view_count:ch.statistics?.viewCount??null,is_active:true,user_tracking_preference:true,ai_production_status:"qualified",ai_production_reviewed_at:now,ai_production_review_note:"Manually selected by channel owner. AI niche score bypassed; hard exclusions apply.",ai_production_evidence:{...old,manualApproval:true,manualApprovalAt:now,manualApprovalSource:"creator_explorer"},is_manual_priority:true,last_checked_at:now,last_user_action:"manual_priority_added",last_user_action_at:now};
  const saved=await s.from("competitors").upsert(competitor,{onConflict:"owner_id,youtube_channel_id"}).select("id").single();
  if(saved.error)throw new Error("Could not promote channel: "+saved.error.message);
  const name=String(b.display_name??"").trim().slice(0,120)||title;
  const existingManual=await s.from("manual_tracked_channels").select("id").eq("owner_id",user.id).eq("platform","youtube").eq("youtube_channel_id",channelId).maybeSingle();
  const manualPayload={owner_id:user.id,platform:"youtube",url:x.url,display_name:name,is_active:true,youtube_channel_id:channelId,competitor_id:saved.data.id,monitoring_status:"queued",last_checked_at:now,next_check_at:now,last_error:null};
  const manualWrite=existingManual.data
    ? await s.from("manual_tracked_channels").update(manualPayload).eq("id",existingManual.data.id).select("*").single()
    : await s.from("manual_tracked_channels").upsert(manualPayload,{onConflict:"owner_id,platform,url"}).select("*").single();
  if(manualWrite.error)throw new Error("Competitor promoted, but manual link save failed: "+manualWrite.error.message);
  return NextResponse.json({item:manualWrite.data,channelTitle:title,priority:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Could not add channel."},{status:502});}
}
export async function PATCH(req:NextRequest){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase unavailable"},{status:503});
 const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 let b:Record<string,unknown>;try{b=await req.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
 if(typeof b.id!=="string"||typeof b.is_active!=="boolean")return NextResponse.json({error:"id and is_active required"},{status:400});
 const{data:link}=await s.from("manual_tracked_channels").select("id,platform,competitor_id").eq("id",b.id).eq("owner_id",user.id).maybeSingle();if(!link)return NextResponse.json({error:"Not found"},{status:404});
 const{data,error}=await s.from("manual_tracked_channels").update({is_active:b.is_active,monitoring_status:b.is_active?"queued":"paused"}).eq("id",b.id).eq("owner_id",user.id).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:500});
 if(link.platform==="youtube"&&link.competitor_id){const r=await s.from("competitors").update({is_active:b.is_active,user_tracking_preference:b.is_active,is_manual_priority:true,last_user_action:b.is_active?"manual_priority_resumed":"manual_priority_paused",last_user_action_at:new Date().toISOString()}).eq("id",link.competitor_id).eq("owner_id",user.id);if(r.error)return NextResponse.json({error:r.error.message},{status:500});}
 return NextResponse.json({item:data});
}
export async function DELETE(req:NextRequest){
 const s=await createSupabaseServerClient();if(!s)return NextResponse.json({error:"Supabase unavailable"},{status:503});
 const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const id=req.nextUrl.searchParams.get("id");if(!id)return NextResponse.json({error:"id required"},{status:400});
 const{data:link}=await s.from("manual_tracked_channels").select("platform,competitor_id").eq("id",id).eq("owner_id",user.id).maybeSingle();
 const{error}=await s.from("manual_tracked_channels").delete().eq("id",id).eq("owner_id",user.id);if(error)return NextResponse.json({error:error.message},{status:500});
 if(link?.platform==="youtube"&&link.competitor_id)await s.from("competitors").update({is_manual_priority:false,is_active:false,user_tracking_preference:false,last_user_action:"manual_priority_removed",last_user_action_at:new Date().toISOString()}).eq("id",link.competitor_id).eq("owner_id",user.id);
 return NextResponse.json({ok:true});
}
