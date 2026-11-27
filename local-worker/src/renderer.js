import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import sharp from "sharp";
const esc=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
function lines(text,max=25){const out=[];let line="";for(const word of String(text??"").split(/\\s+/)){if((line+" "+word).trim().length>max&&line){out.push(line);line=word;}else line=(line+" "+word).trim();}if(line)out.push(line);return out.slice(0,6);}
function run(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{windowsHide:true});let err="";p.stderr.on("data",d=>err=(err+d.toString()).slice(-5000));p.on("error",reject);p.on("close",c=>c===0?resolve():reject(new Error(`${path.basename(bin)} exited ${c}: ${err}`)));});}
async function probe(ffprobe,file){return Number((await capture(ffprobe,["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",file])).trim());}
function capture(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{windowsHide:true});let out="",err="";p.stdout.on("data",d=>out+=d);p.stderr.on("data",d=>err+=d);p.on("error",reject);p.on("close",c=>c===0?resolve(out):reject(new Error(err)));});}
function srtTime(seconds){const ms=Math.max(0,Math.round(seconds*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),z=ms%1000;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(z).padStart(3,"0")}`;}
export async function writeSubtitles(transcription,file){const entries=[];let index=1;for(const row of transcription.segments){const words=lines(row.text,34);const span=(row.end-row.start)/Math.max(1,words.length);words.forEach((text,i)=>entries.push(`${index++}\\n${srtTime(row.start+i*span)} --> ${srtTime(Math.min(row.end,row.start+(i+1)*span))}\\n${text}\\n`));}await fs.writeFile(file,entries.join("\\n"),"utf8");}
function cardSvg(job,segment,stock){const title=lines(job.title,24).slice(0,2),caption=lines(segment.onScreenText||segment.narration,28);const base=stock?"":'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071827"/><stop offset="1" stop-color="#172b50"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><circle cx="870" cy="720" r="360" fill="#0ea5e9" opacity=".13"/><circle cx="150" cy="1000" r="240" fill="#8b5cf6" opacity=".13"/>';
const titleSvg=title.map((x,i)=>`<text x="75" y="${265+i*80}" class="title">${esc(x)}</text>`).join("");
const capSvg=caption.map((x,i)=>`<text x="85" y="${1320+i*58}" class="caption">${esc(x)}</text>`).join("");
return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><style>.brand{font:700 32px Arial;fill:#67e8f9}.title{font:700 65px Arial;fill:#fff}.caption{font:600 39px Arial;fill:#fff}.small{font:28px Arial;fill:#bae6fd}</style>${base}${stock?'<rect x="40" y="1080" width="1000" height="650" rx="45" fill="#06111e" opacity=".82"/>':""}<text x="75" y="125" class="brand">AIWITHBH@I / ENGINEERING EXPLAINED</text>${titleSvg}<rect x="75" y="390" width="125" height="9" rx="5" fill="#22d3ee"/><text x="75" y="980" class="small">${esc(segment.visualPrompt).slice(0,120)}</text>${capSvg}<text x="75" y="1830" class="small">AI systems • Architecture • Real engineering</text></svg>`;}
async function getAssets(dir){try{return(await fs.readdir(dir)).filter(x=>/\\.(jpg|jpeg|png|webp|mp4|mov|mkv)$/i.test(x)).sort().map(x=>path.join(dir,x));}catch{return[];}}
export async function renderSegments({job,workDir,stockDir,ffmpeg,ffprobe}){
 const assets=await getAssets(stockDir),clips=[];
 for(let i=0;i<job.segments.length;i++){
  const seg=job.segments[i],duration=Number(seg.durationSeconds);if(!(duration>0&&duration<=7.01))throw new Error("Invalid seven-second segment duration.");
  const asset=assets.length?assets[i%assets.length]:null,overlay=path.join(workDir,`overlay-${i+1}.png`);
  await sharp(Buffer.from(cardSvg(job,seg,asset))).png().toFile(overlay);
  const clip=path.join(workDir,`clip-${String(i+1).padStart(2,"0")}.mp4`),args=[];
  if(asset&&/\\.(mp4|mov|mkv)$/i.test(asset))args.push("-stream_loop","-1","-i",asset);else if(asset)args.push("-loop","1","-framerate","30","-i",asset);else args.push("-loop","1","-framerate","30","-i",overlay);
  if(asset)args.push("-loop","1","-framerate","30","-i",overlay);
  if(asset)args.push("-filter_complex","[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[bg];[bg][1:v]overlay=0:0,format=yuv420p[v]","-map","[v]");else args.push("-vf","scale=1080:1920,format=yuv420p");
  args.push("-t",String(duration),"-an","-r","30","-c:v","libx264","-preset","veryfast","-crf","21","-pix_fmt","yuv420p","-movflags","+faststart","-y",clip);await run(ffmpeg,args);clips.push(clip);
 }
 const list=path.join(workDir,"concat.txt");await fs.writeFile(list,clips.map(x=>"file '"+x.replaceAll("\\","/").replaceAll("'","'\\''")+"'").join("\\n"),"utf8");
 const silent=path.join(workDir,"silent.mp4");await run(ffmpeg,["-f","concat","-safe","0","-i",list,"-c","copy","-y",silent]);return {clips,silent,duration:await probe(ffprobe,silent)};
}
export async function muxFinal({silent,audio,subtitles,final,ffmpeg,ffprobe}){
 await run(ffmpeg,["-i",silent,"-i",audio,"-vf",`subtitles='${subtitles.replaceAll("\\","/").replaceAll(":","\\:")}'`,"-map","0:v:0","-map","1:a:0","-c:v","libx264","-preset","veryfast","-crf","21","-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart","-y",final]);
 const duration=await probe(ffprobe,final);if(!Number.isFinite(duration)||duration<30||duration>60)throw new Error(`Final duration ${duration.toFixed(1)}s outside allowed 30-60s.`);return duration;
}
