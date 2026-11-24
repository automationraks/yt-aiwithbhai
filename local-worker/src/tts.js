export async function synthesizeApprovedScript({text,apiKey,model,voice,language}){
 if(!text||!apiKey)throw new Error("Approved script and GEMINI_API_KEY are required.");
 const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
 const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
  contents:[{parts:[{text:"Read the narration verbatim. Do not add, omit, paraphrase, summarize, or announce anything.\n\n"+text}]}],
  generationConfig:{responseModalities:["AUDIO"],speechConfig:{languageCode:language||"en-IN",voiceConfig:{prebuiltVoiceConfig:{voiceName:voice||"Kore"}}}}
 }),signal:AbortSignal.timeout(120000)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(payload?.error?.message||`Gemini TTS failed (${response.status}).`);
 const part=payload?.candidates?.[0]?.content?.parts?.find(p=>p?.inlineData?.data);
 if(!part)throw new Error("Gemini TTS returned no audio part.");
 return {audio:Buffer.from(part.inlineData.data,"base64"),mimeType:part.inlineData.mimeType||"audio/L16;codec=pcm;rate=24000"};
}
