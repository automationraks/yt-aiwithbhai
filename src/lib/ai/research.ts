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
export async function generateResearchJson(
  system:string,
  prompt:string,
  options?:{preferredProvider?:AIProvider;allowFallback?:boolean}
){
  const config=getAIConfiguration();
  if(!config.configured) throw new Error("Configure GEMINI_API_KEY or GROQ_API_KEY in the server environment.");
  const preferred=options?.preferredProvider??config.primary;
  if(!config.available.includes(preferred)) {
    if(options?.allowFallback===false) throw new Error(preferred.toUpperCase()+"_API_KEY is required for this AI task.");
  }
  const fallback:AIProvider=preferred==="gemini"?"groq":"gemini";
  const run=async(provider:AIProvider)=>{
    const data=provider==="gemini"?await gemini(system,prompt):await groq(system,prompt);
    return {data,provider:provider==="gemini"?(process.env.GEMINI_MODEL||"gemini-2.5-flash-lite"):(process.env.GROQ_MODEL||"openai/gpt-oss-120b"),fallbackUsed:provider!==preferred};
  };
  try {
    if(config.available.includes(preferred)) return await run(preferred);
    return await run(fallback);
  } catch(primaryError) {
    if(options?.allowFallback===false||!config.available.includes(fallback)) throw primaryError;
    return await run(fallback);
  }
}