import { getAIConfiguration, type AIProvider } from "@/lib/ai/provider";
function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch { const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}"); if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)); throw new Error("AI provider returned invalid JSON."); }
}
async function gemini(system: string, prompt: string): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  // Gemini 3.5 Flash-Lite is served through the Interactions API, not the
  // legacy /models/{model}:generateContent endpoint.
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model,
      input: prompt,
      system_instruction: system,
      generation_config: { max_output_tokens: 2500, thinking_level: "minimal" },
      response_format: { type: "text", mime_type: "application/json" },
      store: false,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Gemini Interactions request failed (" + response.status + ").");
  const stepText = Array.isArray(payload?.steps)
    ? payload.steps.filter((step: { type?: string }) => step?.type === "model_output")
      .flatMap((step: { content?: Array<{ type?: string; text?: string }> }) => Array.isArray(step.content) ? step.content : [])
      .filter((part: { type?: string; text?: string }) => part?.type === "text" && typeof part.text === "string")
      .map((part: { text: string }) => part.text).join("\\n")
    : "";
  const output = typeof payload?.output_text === "string" && payload.output_text
    ? payload.output_text
    : stepText || (Array.isArray(payload?.outputs) ? payload.outputs.map((item: { text?: string }) => item?.text ?? "").join("\\n") : "");
  if (!output) throw new Error("Gemini Interactions API returned no text output.");
  return parseJson(output);
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
    return {data,provider:provider==="gemini"?(process.env.GEMINI_MODEL||"gemini-3.5-flash-lite"):(process.env.GROQ_MODEL||"openai/gpt-oss-120b"),fallbackUsed:provider!==preferred};
  };
  try {
    if(config.available.includes(preferred)) return await run(preferred);
    return await run(fallback);
  } catch(primaryError) {
    if(options?.allowFallback===false||!config.available.includes(fallback)) throw primaryError;
    return await run(fallback);
  }
}