import { getAIConfiguration } from "@/lib/ai/provider";
function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch { const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}"); if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)); throw new Error("AI provider returned invalid JSON."); }
}
async function gemini(system: string, prompt: string): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", { method:"POST", headers:{"Content-Type":"application/json","x-goog-api-key":key}, body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.25,maxOutputTokens:7000}}), signal:AbortSignal.timeout(60000) });
  const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload?.error?.message || "Gemini request failed (" + response.status + ").");
  const output = payload?.candidates?.[0]?.content?.parts?.map((part:{text?:string})=>part.text ?? "").join(""); if (!output) throw new Error("Gemini returned an empty response."); return parseJson(output);
}
async function groq(system:string,prompt:string):Promise<unknown>{
  const key=process.env.GROQ_API_KEY; if(!key) throw new Error("GROQ_API_KEY is not configured."); const model=process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},body:JSON.stringify({model,temperature:0.25,response_format:{type:"json_object"},messages:[{role:"system",content:system},{role:"user",content:prompt}]}),signal:AbortSignal.timeout(60000)});
  const payload=await response.json().catch(()=>({})); if(!response.ok) throw new Error(payload?.error?.message || "Groq request failed ("+response.status+")."); const output=payload?.choices?.[0]?.message?.content; if(!output) throw new Error("Groq returned an empty response."); return parseJson(output);
}
export async function generateResearchJson(system:string,prompt:string){
  const config=getAIConfiguration(); if(!config.configured) throw new Error("Configure GEMINI_API_KEY or GROQ_API_KEY in the server environment.");
  const preferred=config.primary; const fallback=preferred==="gemini"?"groq":"gemini";
  try { if(preferred==="gemini"&&config.available.includes("gemini")) return {data:await gemini(system,prompt),provider:process.env.GEMINI_MODEL||"gemini-2.5-flash-lite",fallbackUsed:false}; if(preferred==="groq"&&config.available.includes("groq")) return {data:await groq(system,prompt),provider:process.env.GROQ_MODEL||"openai/gpt-oss-120b",fallbackUsed:false}; if(config.available.includes("gemini")) return {data:await gemini(system,prompt),provider:process.env.GEMINI_MODEL||"gemini-2.5-flash-lite",fallbackUsed:false}; return {data:await groq(system,prompt),provider:process.env.GROQ_MODEL||"openai/gpt-oss-120b",fallbackUsed:false}; }
  catch(primaryError){ if(!config.available.includes(fallback)) throw primaryError; const data=fallback==="gemini"?await gemini(system,prompt):await groq(system,prompt); return {data,provider:fallback==="gemini"?(process.env.GEMINI_MODEL||"gemini-2.5-flash-lite"):(process.env.GROQ_MODEL||"openai/gpt-oss-120b"),fallbackUsed:true}; }
}