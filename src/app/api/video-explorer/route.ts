import { NextRequest,NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
type ExplorerVideo={ [key:string]:unknown; platform:string; external_video_id:string; view_count?:unknown; like_count?:unknown; comment_count?:unknown; };
type Platform="youtube"|"instagram";
function parseVideoUrl(raw:string):{platform:Platform;id:string;url:string}|null{
 try{const u=new URL(raw);if(!["https:","http:"].includes(u.protocol))return null;const host=u.hostname.toLowerCase().replace(/^www\./,"");
 if(["youtube.com","m.youtube.com","youtu.be"].includes(host)){const p=u.pathname.split("/").filter(Boolean);const id=host==="youtu.be"?p[0]:p[0]==="watch"?u.searchParams.get("v"):["shorts","live","embed"].includes(p[0])?p[1]:null;return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?{platform:"youtube",id,url:"https://www.youtube.com/watch?v="+id}:null;}
 if(["instagram.com","m.instagram.com"].includes(host)){const p=u.pathname.split("/").filter(Boolean);const ix=p.findIndex(x=>["reel","reels","p","tv"].includes(x));const id=ix>=0?p[ix+1]:null;return id?{platform:"instagram",id,url:u.origin+"/"+p.slice(0,ix+2).join("/")+"/"}:null;}
 return null;}catch{return null;}
}
async function auth(){const db=await createSupabaseServerClient();if(!db)return{response:NextResponse.json({error:"Supabase is not configured."},{status:503})};const{data:{user},error}=await db.auth.getUser();if(error||!user)return{response:NextResponse.json({error:"Unauthorized."},{status:401})};return{db,user};}
export async function GET(){
 const a=await auth();if("response"in a)return a.response;const{db,user}=a;
 const{data:shortlists,error}=await db.from("video_shortlists").select("id,social_video_id,source_feature,shortlisted_at").eq("owner_id",user.id).order("shortlisted_at",{ascending:false}).limit(1000);
 if(error)return NextResponse.json({error:"Could not load unified shortlists.",details:error.message},{status:500});
 const ids=(shortlists??[]).map(x=>x.social_video_id);let social:Record<string,unknown>[]=[];
 if(ids.length){const r=await db.from("social_videos").select("*").eq("owner_id",user.id).in("id",ids);if(r.error)return NextResponse.json({error:r.error.message},{status:500});social=(r.data??[]) as Record<string,unknown>[];}
 const byId=new Map(social.map(x=>[String(x.id),x]));
 const videos:ExplorerVideo[]=(shortlists??[]).flatMap(x=>{const v=byId.get(x.social_video_id);return v?[{...v,shortlist_id:x.id,source_feature:x.source_feature,shortlisted_at:x.shortlisted_at,platform:String(v.platform),external_video_id:String(v.external_video_id),channelTitle:v.source_channel_name??"Unknown channel",channelUrl:v.source_channel_url??null}]:[];});
 // Preserve historical YouTube research even if a channel is later unqualified or removed.
 const legacy=await db.from("videos").select("id,competitor_id,youtube_video_id,title,description,published_at,duration_seconds,view_count,like_count,comment_count,is_short,thumbnail_url,video_url,niche_relevance_score,niche_relevance_reason").eq("owner_id",user.id).eq("is_niche_relevant",true).order("published_at",{ascending:false}).limit(500);
 if(legacy.error)return NextResponse.json({error:"Could not load historical YouTube videos.",details:legacy.error.message},{status:500});
 const channels=await db.from("competitors").select("id,channel_title,channel_url").eq("owner_id",user.id);
 const channelMap=new Map((channels.data??[]).map(x=>[x.id,x]));
 const historical:ExplorerVideo[]=(legacy.data??[]).map(v=>{const c=channelMap.get(v.competitor_id??"");return{...v,platform:"youtube",external_video_id:v.youtube_video_id,permalink:v.video_url,source_feature:"historical_research",is_shortlisted:false,channelTitle:c?.channel_title??"Previously tracked channel",channelUrl:c?.channel_url??null};});
 const merged=[...videos.map(v=>({...v,is_shortlisted:true})),...historical.filter(v=>!videos.some(x=>x.platform==="youtube"&&x.external_video_id===v.youtube_video_id))];
 const summary={shortlisted:videos.length,youtube:videos.filter(x=>x.platform==="youtube").length,instagram:videos.filter(x=>x.platform==="instagram").length,historical:historical.length,totalViews:merged.reduce((n,v)=>n+Number(v.view_count??0),0),totalLikes:merged.reduce((n,v)=>n+Number(v.like_count??0),0),totalComments:merged.reduce((n,v)=>n+Number(v.comment_count??0),0)};
 return NextResponse.json({videos:merged,shortlists:videos,summary});
}
export async function POST(req:NextRequest){
 const a=await auth();if("response"in a)return a.response;const{db,user}=a;
 let b:Record<string,unknown>;try{b=await req.json()}catch{return NextResponse.json({error:"Invalid JSON."},{status:400});}
 const action=String(b.action??"");
 let platform:Platform,id="",permalink="",title="",description:string|null=null,thumbnail:string|null=null,channelName:string|null=null,channelId:string|null=null,channelUrl:string|null=null,publishedAt:string|null=null;
 if(action==="add_manual_link"){
  const parsed=parseVideoUrl(String(b.url??"").trim());if(!parsed)return NextResponse.json({error:"Enter a valid YouTube video/Short or Instagram Reel/post URL."},{status:400});
  platform=parsed.platform;id=parsed.id;permalink=parsed.url;title=String(b.title??"").trim().slice(0,300)||"Manually added "+(platform==="youtube"?"YouTube video":"Instagram post");
  description=String(b.description??"").slice(0,4000)||null;channelName=String(b.channelName??"").trim().slice(0,160)||"Manually added source";channelUrl=null;
 }else if(action==="shortlist"){
  platform=b.platform==="instagram"?"instagram":"youtube";id=String(b.externalVideoId??"").trim();permalink=String(b.permalink??"").trim();title=String(b.title??"").trim().slice(0,300);
  description=String(b.description??"").slice(0,4000)||null;thumbnail=typeof b.thumbnailUrl==="string"?b.thumbnailUrl:null;
  channelName=typeof b.channelName==="string"?b.channelName.slice(0,160):null;channelId=typeof b.channelId==="string"?b.channelId:null;channelUrl=typeof b.channelUrl==="string"?b.channelUrl:null;
  publishedAt=typeof b.publishedAt==="string"&&Number.isFinite(Date.parse(b.publishedAt))?new Date(b.publishedAt).toISOString():null;
  if(!id||!permalink||!title)return NextResponse.json({error:"platform, externalVideoId, permalink and title are required."},{status:400});
 }else return NextResponse.json({error:"Unsupported action."},{status:400});
 if(id.length>200||!/^https?:\/\//i.test(permalink))return NextResponse.json({error:"Invalid video reference."},{status:400});
 const {data:video,error:videoError}=await db.from("social_videos").upsert({owner_id:user.id,platform,external_video_id:id,source_channel_id:channelId,source_channel_name:channelName,source_channel_url:channelUrl,title,description,permalink,thumbnail_url:thumbnail,published_at:publishedAt,...(action==="add_manual_link"?{is_custom_source:true}:{}),last_seen_at:new Date().toISOString()},{onConflict:"owner_id,platform,external_video_id"}).select("id").single();
 if(videoError||!video)return NextResponse.json({error:"Could not save video reference.",details:videoError?.message},{status:500});
 const sourceFeature=action==="add_manual_link"?"manual":(["instagram_discovery","channel_preparation","competitor_explorer"].includes(String(b.sourceFeature))?String(b.sourceFeature):"manual");
 const {data:shortlist,error:shortlistError}=await db.from("video_shortlists").upsert({owner_id:user.id,social_video_id:video.id,source_feature:sourceFeature},{onConflict:"owner_id,social_video_id",ignoreDuplicates:true}).select("id,shortlisted_at").maybeSingle();
 if(shortlistError)return NextResponse.json({error:"Video saved, but shortlist failed.",details:shortlistError.message},{status:500});
 const existing=shortlist??(await db.from("video_shortlists").select("id,shortlisted_at").eq("owner_id",user.id).eq("social_video_id",video.id).single()).data;
 if(platform==="instagram"){await db.from("instagram_content_sources").update({content_status:"shortlisted"}).eq("owner_id",user.id).eq("instagram_media_id",id);}
 return NextResponse.json({ok:true,alreadyShortlisted:!shortlist,videoId:video.id,shortlist:existing});
}
