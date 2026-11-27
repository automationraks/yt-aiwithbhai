import "dotenv/config";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

for (const key of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","GEMINI_API_KEY"]) {
  if (!process.env[key]) throw new Error("Missing environment variable " + key);
}
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const workerId=process.env.WORKER_ID||os.hostname()+":"+process.pid;
const poll=Math.max(2000,Number(process.env.POLL_INTERVAL_MS)||5000);
const model=process.env.GEMINI_IMAGE_MODEL||"imagen-3.0-generate-002";
const bucket=process.env.ASSET_BUCKET||"generated-videos";
let stopping=false,active=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function claim(){
 const {data,error}=await db.rpc("claim_scene_asset_job",{p_worker_id:workerId});
 if(error)throw error;
 return Array.isArray(data)?data[0]??null:data??null;
}
async function heartbeat(id){
 const {data,error}=await db.rpc("heartbeat_scene_asset_job",{p_job_id:id,p_worker_id:workerId});
 if(error)throw error;
 if(data!==true)throw new Error("Scene asset lease lost.");
}
async function generate(prompt){
 const endpoint="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":predict";
 const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},body:JSON.stringify({instances:[{prompt:prompt+" Create one original, high-quality cinematic vertical 9:16 visual. No text, captions, logos, watermarks, UI labels or recognizable copyrighted characters."}],parameters:{sampleCount:1,aspectRatio:"9:16",personGeneration:"dont_allow"}}),signal:AbortSignal.timeout(120000)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(payload.error?.message||"Gemini image generation failed ("+response.status+").");
 const encoded=payload.predictions?.[0]?.bytesBase64Encoded;
 if(typeof encoded!=="string"||!encoded)throw new Error("Image provider returned no image bytes.");
 return Buffer.from(encoded,"base64");
}
async function process(job){
 const prompt=String(job.prompt||"").trim();
 if(!prompt)throw new Error("Scene prompt is empty.");
 const image=await generate(prompt);
 const storagePath=job.owner_id+"/"+job.idea_id+"/scenes/scene-"+String(job.sequence).padStart(2,"0")+".png";
 const {error:uploadError}=await db.storage.from(bucket).upload(storagePath,image,{contentType:"image/png",upsert:true,cacheControl:"3600"});
 if(uploadError)throw uploadError;
 const {data,error}=await db.from("scene_asset_jobs").update({
  status:"completed",provider:"gemini",asset_storage_path:storagePath,asset_url:null,error_message:null,
  metadata:{...(job.metadata||{}),imageModel:model,imageMimeType:"image/png",generatedAt:new Date().toISOString()}
 }).eq("id",job.id).eq("status","processing").eq("claimed_by",workerId).select("id").maybeSingle();
 if(error)throw error;
 if(!data)throw new Error("Lost scene asset lease before saving completion.");
}
async function loop(){
 while(!stopping){
  try{
   const job=await claim();
   if(!job){await sleep(poll);continue;}
   active=true;
   const timer=setInterval(()=>{void heartbeat(job.id).catch(e=>console.error("Heartbeat failed:",e.message));},30000);
   try{await process(job);console.log("Generated scene asset",job.id);}
   catch(e){
    const message=e instanceof Error?e.message:"Scene image generation failed.";
    console.error("Scene asset job failed",job.id,message);
    await db.from("scene_asset_jobs").update({status:"failed",error_message:message.slice(0,1500)})
      .eq("id",job.id).eq("status","processing").eq("claimed_by",workerId);
   }finally{clearInterval(timer);active=false;}
  }catch(e){console.error("Worker poll failed:",e);await sleep(poll);}
 }
}
const server=(await import("node:http")).createServer((req,res)=>{
 if(req.method==="GET"&&req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,worker:"scene-image-worker",workerId,active,model}));return;}
 res.writeHead(404);res.end();
});
const port=Number(process.env.PORT)||8788;
server.listen(port,"0.0.0.0",()=>console.log("Scene image worker listening on "+port));
process.on("SIGINT",()=>{stopping=true;server.close();});
process.on("SIGTERM",()=>{stopping=true;server.close();});
await loop();
