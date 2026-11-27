import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {spawn} from "node:child_process";
import {createClient} from "@supabase/supabase-js";
import {synthesizeApprovedScript} from "./tts.js";
import {renderSegments,muxFinal,writeSubtitles} from "./renderer.js";
for(const key of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","GEMINI_API_KEY","N8N_WEBHOOK_SECRET"])if(!process.env[key])throw new Error("Missing environment variable "+key);
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const root=process.cwd(),output=path.resolve(process.env.OUTPUT_DIR||"./output"),temp=path.resolve(process.env.TEMP_DIR||"./temp"),stock=path.resolve(process.env.STOCK_ASSETS_DIR||"./assets/stock"),ffmpeg=process.env.FFMPEG_PATH||"ffmpeg",ffprobe=process.env.FFPROBE_PATH||"ffprobe",python=process.env.PYTHON_PATH||"python",poll=Math.max(2000,Number(process.env.POLL_INTERVAL_MS)||5000);
let stopping=false,active=false;
const workerId=process.env.WORKER_ID||`${os.hostname()}:${process.pid}`;
function exec(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{windowsHide:true});let out="",err="";p.stdout.on("data",d=>out+=d);p.stderr.on("data",d=>err=(err+d).slice(-4000));p.on("error",reject);p.on("close",c=>c===0?resolve(out):reject(new Error(`${bin} exited ${c}: ${err}`)));});}
async function pcmToWav(pcm,wav,mime){const rate=Number(mime.match(/rate=(\\d+)/i)?.[1]||24000);await exec(ffmpeg,["-f","s16le","-ar",String(rate),"-ac","1","-i",pcm,"-c:a","pcm_s16le","-y",wav]);}
async function probe(file){return Number((await exec(ffprobe,["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",file])).trim());}
async function transcribe(file){const raw=await exec(python,[path.join(root,"src","transcribe.py"),file]);return JSON.parse(raw.trim().split(/\\r?\\n/).at(-1));}
async function update(id,values){const {data,error}=await db.from("video_render_jobs").update({...values,updated_at:new Date().toISOString()}).eq("id",id).eq("claimed_by",workerId).select("id").maybeSingle();if(error)throw error;if(!data)throw new Error("Render job lease was lost before status update.");}
async function logEvent(job,eventKey,stage,status,message,metadata={}){const {error}=await db.from("workflow_event_logs").insert({owner_id:job.owner_id,idea_id:job.idea_id,workflow:"video_production",event_key:eventKey,stage,status,message,metadata});if(error)console.error("Workflow event log failed:",error.message);}
async function upload(file,dest){const data=await fs.readFile(file);const {error}=await db.storage.from("generated-videos").upload(dest,data,{contentType:"video/mp4",upsert:true,cacheControl:"3600"});if(error)throw error;}
async function callback(job,payload){const r=await fetch(job.callbackUrl,{method:"POST",headers:{"content-type":"application/json","x-production-callback-secret":process.env.N8N_WEBHOOK_SECRET},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error("Production callback rejected "+r.status+": "+(d.error||d.reason||"unknown"));return d;}
async function claim(){
 const {data,error}=await db.rpc("claim_video_render_job",{p_worker_id:workerId});
 if(error)throw error;
 return Array.isArray(data)?(data[0]??null):(data??null);
}
async function heartbeat(jobId){
 const {data,error}=await db.rpc("heartbeat_video_render_job",{p_job_id:jobId,p_worker_id:workerId});
 if(error)throw error;
 if(data!==true)throw new Error("Render job lease was lost; worker no longer owns this job.");
}
async function process(row){
 const j=row.payload,crypto=await import("node:crypto");
 await logEvent(row,"worker_started","worker_started","processing","Local renderer claimed the approved video job.",{jobId:row.id,attempt:row.attempts});
 const {error:ideaStatusError}=await db.from("content_ideas").update({video_production_status:"processing",video_verification:{stage:"local_rendering",jobId:row.id}}).eq("id",row.idea_id).eq("owner_id",row.owner_id);
 if(ideaStatusError)throw ideaStatusError;if(!j||!j.approvedScript||!Array.isArray(j.segments)||!j.callbackUrl)throw new Error("Queue payload incomplete.");
 const hash=crypto.createHash("sha256").update(j.approvedScript,"utf8").digest("hex");if(hash!==row.script_hash||hash!==j.scriptHash)throw new Error("Approved script SHA-256 mismatch.");
 if(j.segments.some((s,i)=>s.sequence!==i+1||!s.outputStoragePath))throw new Error("Segments are missing or out of order.");
 const work=path.join(temp,row.id);await fs.mkdir(work,{recursive:true});await fs.mkdir(output,{recursive:true});
 const pcm=path.join(work,"voice.pcm"),wav=path.join(work,"voice.wav"),final=path.join(work,"final.mp4");
 await logEvent(row,"tts_started","narration_synthesis","started","Generating narration from the frozen approved script.");
 const tts=await synthesizeApprovedScript({text:j.approvedScript,apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_TTS_MODEL||"gemini-2.5-flash-preview-tts",voice:process.env.GEMINI_TTS_VOICE||"Kore",language:process.env.GEMINI_TTS_LANGUAGE||"en-IN"});
 await logEvent(row,"tts_completed","narration_synthesis","completed","Approved narration audio generated.",{mimeType:tts.mimeType});
 await fs.writeFile(pcm,tts.audio);await pcmToWav(pcm,wav,tts.mimeType);
 const audioSeconds=await probe(wav),target=Number(j.targetDurationSeconds)||audioSeconds;
 if(audioSeconds<30||audioSeconds>60)throw new Error("Gemini TTS duration outside required 30–60 second range: "+audioSeconds.toFixed(1));
 const ratio=audioSeconds/target;if(ratio<0.82||ratio>1.2)throw new Error("Narration duration differs too much from approved target. Adjust script duration and approve again.");
 const adjusted=path.join(work,"voice-adjusted.wav");await exec(ffmpeg,["-i",wav,"-filter:a",`atempo=${(audioSeconds/target).toFixed(4)}`,"-ac","1","-ar","24000","-y",adjusted]);
 const segments=j.segments.map(s=>({...s,durationSeconds:Number(s.durationSeconds)})),planTotal=segments.reduce((n,s)=>n+s.durationSeconds,0);
 if(target<30||target>60||Math.abs(planTotal-target)>1.5)throw new Error("Segment timeline must total 30–60 seconds and match the target duration.");
 await logEvent(row,"segment_render_started","segment_rendering","started","Rendering the approved storyboard into ordered video segments.",{segmentCount:segments.length});
 const {data:sceneAssets,error:sceneAssetError}=await db.from("scene_asset_jobs").select("sequence,asset_storage_path,status")
  .eq("owner_id",row.owner_id).eq("idea_id",row.idea_id).eq("status","completed").order("sequence",{ascending:true});
 if(sceneAssetError)throw new Error("Could not load generated scene assets: "+sceneAssetError.message);
 for(const asset of sceneAssets??[]){
  if(!asset.asset_storage_path)continue;
  const {data:blob,error:downloadError}=await db.storage.from("generated-videos").download(asset.asset_storage_path);
  if(downloadError)throw new Error("Could not download generated scene asset "+asset.sequence+": "+downloadError.message);
  const local=path.join(work,"scene-"+String(asset.sequence).padStart(2,"0")+".png");
  await fs.writeFile(local,Buffer.from(await blob.arrayBuffer()));
  const segment=segments.find(x=>x.sequence===asset.sequence);
  if(segment)segment.visualAssetPath=local;
 }
 const rendered=await renderSegments({job:{...j,segments},workDir:work,stockDir:stock,ffmpeg,ffprobe});
 await logEvent(row,"segment_render_completed","segment_rendering","completed","All video segments rendered in sequence.",{segmentCount:rendered.clips.length});
 const captionAsr=await transcribe(adjusted),srt=path.join(work,"captions.srt");await writeSubtitles(captionAsr,srt);
 const duration=await muxFinal({silent:rendered.silent,audio:adjusted,subtitles:srt,final,ffmpeg,ffprobe});
 const asr=await transcribe(final),results=[];for(let i=0;i<rendered.clips.length;i++){await upload(rendered.clips[i],segments[i].outputStoragePath);results.push({sequence:segments[i].sequence,storagePath:segments[i].outputStoragePath,status:"completed"});}
 await upload(final,j.storage.finalPath);
 const checked=await callback(j,{ownerId:j.ownerId,ideaId:j.ideaId,status:"completed",finalStoragePath:j.storage.finalPath,scriptHash:hash,transcript:asr.text,durationSeconds:duration,segmentResults:results});
 await update(row.id,{status:"completed",completed_at:new Date().toISOString(),error:null,result:{callbackStatus:checked.status,durationSeconds:duration,transcriptMatchesApprovedScript:checked.transcriptMatchesApprovedScript}});
 await logEvent(row,"worker_completed","worker_completed",checked.status==="ready"?"completed":"review_required",checked.status==="ready"?"Local video production and transcript verification completed.":"Video rendered but needs transcript review.",{durationSeconds:duration,transcriptMatchesApprovedScript:checked.transcriptMatchesApprovedScript});
 await fs.rm(work,{recursive:true,force:true});console.log("Completed job "+row.id+"; verification="+checked.status);
}
async function loop(){while(!stopping){try{const row=await claim();if(!row){await new Promise(r=>setTimeout(r,poll));continue;}active=true;const heartbeatTimer=setInterval(()=>{void heartbeat(row.id).catch(e=>console.error("Heartbeat failed for "+row.id+":",e));},30000);try{await process(row);}catch(e){const message=e instanceof Error?e.message:"Local render failed";console.error("Job "+row.id+" failed:",message);await logEvent(row,"worker_failed","worker_failed","failed","Local video renderer failed.",{error:message.slice(0,1000)});await update(row.id,{status:"failed",error:message.slice(0,1500),completed_at:new Date().toISOString()}).catch(console.error);if(row.payload?.callbackUrl)await callback(row.payload,{ownerId:row.payload.ownerId,ideaId:row.payload.ideaId,status:"failed",error:message.slice(0,800)}).catch(console.error);}finally{clearInterval(heartbeatTimer);active=false;}}catch(e){console.error("Worker loop error:",e);await new Promise(r=>setTimeout(r,poll));}}}
const server=(await import("node:http")).createServer((req,res)=>{if(req.method==="GET"&&req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,worker:"AIWithBh@i renderer",workerId,active,pollIntervalMs:poll}));return;}res.writeHead(404);res.end();});
const port=Number(process.env.PORT)||8787;server.listen(port,"127.0.0.1",()=>console.log("Renderer health endpoint http://127.0.0.1:"+port+"/health; outbound Supabase polling active."));
process.on("SIGINT",()=>{stopping=true;server.close();});process.on("SIGTERM",()=>{stopping=true;server.close();});
await loop();
