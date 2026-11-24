"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink, Loader2, Save } from "lucide-react";

type Profile = {
  display_name: string; bio: string; category: string; website_url: string;
  brand_pillars: string[]; voice_guidelines: string; color_palette: string[]; profile_image_url: string;
};
const initial: Profile = {
  display_name: "AIWithBh@i",
  bio: "Building with AI. Automating the future.\n\n🤖 AI Agents | AI Automation | AI Tools\n⚙️ Practical AI workflows & experiments\n🚀 Follow for real-world AI systems",
  category: "Digital Creator", website_url: "",
  brand_pillars: ["AI Tools", "AI Agents", "Automation", "Tutorials", "Projects"],
  voice_guidelines: "Practical, clear, technically accurate, curious and beginner-friendly. Avoid hype and unsupported claims.",
  color_palette: ["#090D14", "#111925", "#22D3EE", "#A78BFA", "#F8FAFC"], profile_image_url: ""
};
const panel = "rounded-xl border border-slate-800 bg-[#111925] p-5";
export default function BrandIdentityPage() {
  const [profile,setProfile] = useState<Profile>(initial);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [pillars,setPillars] = useState("AI Tools, AI Agents, Automation, Tutorials, Projects");
  const [palette,setPalette] = useState("#090D14, #111925, #22D3EE, #A78BFA, #F8FAFC");
  useEffect(()=>{(async()=>{try{const r=await fetch("/api/brand-identity",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load brand settings.");const p={...initial,...d.profile};setProfile(p);setPillars((p.brand_pillars||[]).join(", "));setPalette((p.color_palette||[]).join(", "));}catch(e){setError(e instanceof Error?e.message:"Could not load brand settings.");}finally{setLoading(false);}})();},[]);
  function update<K extends keyof Profile>(key:K,value:Profile[K]){setProfile(p=>({...p,[key]:value}));}
  async function save(){setSaving(true);setError("");setNotice("");try{const r=await fetch("/api/brand-identity",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...profile,brand_pillars:pillars.split(",").map(x=>x.trim()).filter(Boolean),color_palette:palette.split(",").map(x=>x.trim()).filter(Boolean)})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not save brand identity.");setProfile({...initial,...d.profile});setNotice("Brand identity saved in Supabase.");}catch(e){setError(e instanceof Error?e.message:"Could not save brand identity.");}finally{setSaving(false);}}
  const bioLength=profile.bio.length;
  return <main className="min-h-screen bg-[#090d14] p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-5xl">
    <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs text-slate-400"><ArrowLeft size={14}/>Dashboard</Link>
    <div className="mb-6"><div className="mb-2 text-xs text-cyan-400">AIWITHBH@I · BRAND MANAGEMENT</div><h1 className="text-2xl font-semibold">Brand Identity</h1><p className="mt-2 text-sm text-slate-400">Manage the identity guidelines for your existing Instagram account. These settings guide AI-generated content; they do not automatically edit Instagram.</p></div>
    {error&&<p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    {notice&&<p className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}
    {loading?<div className="py-16 text-center text-sm text-slate-400"><Loader2 className="mx-auto mb-2 animate-spin"/>Loading brand identity...</div>:<>
      <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Instagram account</h2><p className="mt-1 text-sm text-slate-400">Existing account: @aiwithbhaii</p></div><a href="https://www.instagram.com/aiwithbhaii/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300">Open Instagram <ExternalLink size={14}/></a></div><p className="mt-3 text-xs text-slate-500">The username remains unchanged. Update the display name, bio and profile photo manually in Instagram. Meta's API does not provide general profile-name editing for this workflow.</p></section>
      <section className={panel+" mt-5"}><h2 className="mb-4 font-semibold">Public profile settings</h2><label className="block text-xs text-slate-400">Display name<input value={profile.display_name} maxLength={80} onChange={e=>update("display_name",e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"/></label><label className="mt-4 block text-xs text-slate-400">Instagram bio <span className="float-right tabular-nums">{bioLength}/150</span><textarea value={profile.bio} maxLength={150} rows={5} onChange={e=>update("bio",e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"/></label><label className="mt-4 block text-xs text-slate-400">Category<input value={profile.category} onChange={e=>update("category",e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"/></label><label className="mt-4 block text-xs text-slate-400">Website URL (optional)<input value={profile.website_url} onChange={e=>update("website_url",e.target.value)} placeholder="https://..." className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"/></label></section>
      <section className={panel+" mt-5"}><h2 className="mb-4 font-semibold">Brand guidelines</h2><label className="block text-xs text-slate-400">Content pillars (comma separated)<input value={pillars} onChange={e=>setPillars(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"/></label><label className="mt-4 block text-xs text-slate-400">Brand voice and content rules<textarea rows={4} value={profile.voice_guidelines} onChange={e=>update("voice_guidelines",e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"/></label><label className="mt-4 block text-xs text-slate-400">Brand color palette (comma separated)<input value={palette} onChange={e=>setPalette(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"/></label><div className="mt-3 flex flex-wrap gap-2">{palette.split(",").map(x=>x.trim()).filter(Boolean).map(color=><span key={color} className="rounded-md border border-slate-700 px-3 py-2 text-xs">{color}</span>)}</div></section>
      <div className="mt-5 flex flex-wrap gap-3"><button onClick={()=>void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving?<Loader2 size={15} className="animate-spin"/>:<Save size={15}/>}Save brand identity</button><button onClick={()=>void navigator.clipboard?.writeText(profile.bio)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300"><Copy size={14}/>Copy bio</button></div>
    </>}
    <section className={panel+" mt-6"}><h2 className="mb-3 font-semibold">Instagram rebranding checklist</h2><ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300"><li>Open Instagram and edit the profile name to the saved display name.</li><li>Keep username @aiwithbhaii as your public Instagram handle.</li><li>Paste the saved bio (maximum 150 characters).</li><li>Upload your AIWithBh@i logo as the profile photo.</li><li>Set the category to Digital Creator or the closest available technology category.</li><li>Create Highlights: AI Tools, AI Agents, Automation, Tutorials, Projects and About Us.</li><li>Keep the Facebook Page link and Meta connection intact; verify Instagram Discovery still reports the connected account.</li></ol><p className="mt-4 text-xs text-slate-500">Instagram changes are manual. This page stores the approved brand configuration and will become the source of truth for future AI content generation.</p></section>
  </div></main>;
}
