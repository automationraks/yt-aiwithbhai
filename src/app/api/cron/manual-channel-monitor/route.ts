import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const API="https://www.googleapis.com/youtube/v3";
const LIMIT=20;
type PlaylistItemsResponse = { items?: Array<{ contentDetails?: { videoId?: string } }> };
type VideoListResponse = { items?: Array<{ id: string; snippet?: { title?: string; description?: string; publishedAt?: string; defaultLanguage?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string } } }; contentDetails?: { duration?: string }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }> };
async function yt<T>(resource:string,params:Record<string,string>):Promise<T>{
 const key=process.env.YOUTUBE_API_KEY;if(!key)throw new Error("YOUTUBE_API_KEY missing");
 const url=new URL(API+"/"+resource);Object.entries({...params,key}).forEach(([k,v])=>url.searchParams.set(k,v));
 const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(12000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||"YouTube API failed");return d as T;
}
// Supabase RPC generics are not generated for this project schema.\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nasync function reserve(s:any){const r=await s.rpc("reserve_youtube_quota_cron",{p_bucket:"general",p_amount:1});if(r.error)throw new Error(r.error.message);if(!(r.data as {allowed?:boolean}|null)?.allowed)throw new Error("YouTube general quota exhausted");}
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;if(!secret||req.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key||!process.env.YOUTUBE_API_KEY)return NextResponse.json({error:"Missing Supabase service role or YouTube API configuration"},{status:503});
 // eslint-disable-next-line @typescript-eslint/no-explicit-any\n const s=createClient<any>(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const now=new Date().toISOString();
  const{data:due,error}=await s.from("manual_tracked_channels").select("id,owner_id,youtube_channel_id,competitor_id").eq("platform","youtube").eq("is_active",true).not("youtube_channel_id","is",null).or(`next_check_at.is.null,next_check_at.lte.${now}`).order("next_check_at",{ascending:true,nullsFirst:true}).limit(LIMIT);
  if(error)throw new Error("Loading due channels failed: "+error.message);
  if(!due?.length)return NextResponse.json({processed:0,message:"No priority channels due"});
  await reserve(s);
  const ids=[...new Set(due.map(x=>x.youtube_channel_id).filter(Boolean))];
  const channels=await yt<{items?:Array<{id:string;snippet?:{title?:string;description?:string;publishedAt?:string;country?:string;customUrl?:string};statistics?:{subscriberCount?:string;videoCount?:string;viewCount?:string};contentDetails?:{relatedPlaylists?:{uploads?:string}}}>}>("channels",{part:"snippet,statistics,contentDetails",id:ids.join(","),maxResults:String(Math.min(50,ids.length))});
  const byId=new Map((channels.items??[]).map(x=>[x.id,x]));let checked=0,failed=0,newUploads=0;
  for(const row of due){
   try{
    const ch=byId.get(row.youtube_channel_id);if(!ch?.snippet?.title)throw new Error("Channel unavailable");
    const identity=ch.snippet.title+" "+(ch.snippet.description??"");
    if(/\b(?:kids?|children|childrens|nursery|cartoons?|toy unboxing|toy reviews?|preschool|baby songs?|बालगीत|बच्चों|बच्चो|stock market|share market|stock trading|share trading|trading|day trading|intraday|nifty|sensex|options trading|crypto trading|investing|investment tips|stock tips|शेयर बाजार|शेयर मार्केट|स्टॉक मार्केट|ट्रेडिंग)\b/i.test(identity)){
     await s.from("manual_tracked_channels").update({is_active:false,monitoring_status:"blocked",last_error:"Metadata matches a protected exclusion"}).eq("id",row.id);
     if(row.competitor_id)await s.from("competitors").update({is_active:false,user_tracking_preference:false}).eq("id",row.competitor_id);
     failed++;continue;
    }
    const st=ch.statistics??{};
    if(row.competitor_id){
     const u=await s.from("competitors").update({channel_title:ch.snippet.title,channel_url:ch.snippet.customUrl?"https://www.youtube.com/@"+ch.snippet.customUrl.replace(/^@/,""):"https://www.youtube.com/channel/"+ch.id,description:ch.snippet.description??null,published_at:ch.snippet.publishedAt??null,country:ch.snippet.country??null,subscriber_count:st.subscriberCount??null,video_count:st.videoCount??null,view_count:st.viewCount??null,is_active:true,user_tracking_preference:true,is_manual_priority:true,last_checked_at:now}).eq("id",row.competitor_id).eq("owner_id",row.owner_id);
     if(u.error)throw new Error(u.error.message);
     const snapshot=await s.from("competitor_snapshots").insert({competitor_id:row.competitor_id,subscriber_count:Number(st.subscriberCount??0),video_count:Number(st.videoCount??0),view_count:Number(st.viewCount??0)});
     if(snapshot.error)throw new Error("Saving channel metric history failed: "+snapshot.error.message);
    }
    const uploads=ch.contentDetails?.relatedPlaylists?.uploads;
    if(uploads){
     await reserve(s);
     const p=await yt<PlaylistItemsResponse>("playlistItems",{part:"contentDetails",playlistId:uploads,maxResults:"5"});
     const vids=[...new Set((p.items??[]).map(x=>x.contentDetails?.videoId).filter((x):x is string=>Boolean(x)))];
     if(vids.length){
      await reserve(s);
      const v=await yt<VideoListResponse>("videos",{part:"snippet,contentDetails,statistics",id:vids.join(","),maxResults:"50"});
      const {data:alreadySaved,error:existingError}=await s.from("videos").select("youtube_video_id").eq("owner_id",row.owner_id).in("youtube_video_id",vids);
      if(existingError)throw new Error("Checking previously seen uploads failed: "+existingError.message);
      const seen=new Set((alreadySaved??[]).map(x=>x.youtube_video_id));
      const rows=(v.items??[]).filter(x=>!seen.has(x.id)).map(x=>{
       const match=x.contentDetails?.duration?.match(/^PT(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?$/);
       const duration=match?Number(match[1]??0)*3600+Number(match[2]??0)*60+Number(match[3]??0):0;
       return {owner_id:row.owner_id,competitor_id:row.competitor_id,youtube_video_id:x.id,title:x.snippet?.title??"Untitled video",description:(x.snippet?.description??"").slice(0,5000),published_at:x.snippet?.publishedAt??null,duration_seconds:duration,view_count:x.statistics?.viewCount??null,like_count:x.statistics?.likeCount??null,comment_count:x.statistics?.commentCount??null,is_short:duration<=180,thumbnail_url:x.snippet?.thumbnails?.high?.url??x.snippet?.thumbnails?.medium?.url??null,video_url:"https://www.youtube.com/watch?v="+x.id,language:x.snippet?.defaultLanguage??null,is_niche_relevant:false,niche_relevance_score:null,niche_relevance_reason:"Manually tracked upload; awaiting niche classification."};
      });
      if(rows.length){const save=await s.from("videos").insert(rows);if(save.error)throw new Error(save.error.message);newUploads+=rows.length;}
     }
    }
    await s.from("manual_tracked_channels").update({monitoring_status:"monitored",last_checked_at:now,next_check_at:new Date(Date.now()+86400000).toISOString(),last_error:null}).eq("id",row.id);
    checked++;
   }catch(e){failed++;await s.from("manual_tracked_channels").update({monitoring_status:"error",last_checked_at:now,next_check_at:new Date(Date.now()+21600000).toISOString(),last_error:e instanceof Error?e.message.slice(0,500):"Monitoring failed"}).eq("id",row.id);}
  }
  return NextResponse.json({due:due.length,checked,failed,latestUploadsUpserted:newUploads,cadenceHours:24});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Priority monitor failed"},{status:502});}
}
