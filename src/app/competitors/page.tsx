"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Search, Target, Users, RefreshCw, Power, AlertCircle, Sparkles } from "lucide-react";

type AIScreening = {
  recommendation?: string;
  industrialRelevance?: number;
  facelessFormatLikelihood?: number;
  syntheticVisualStyleLikelihood?: number;
  narrationEvidence?: string;
  evidence?: string[];
};
type SampleVideo = { title: string; videoUrl: string | null; thumbnailUrl: string | null; matchedQuery: string };
type Competitor = {
  id: string; youtube_channel_id: string; channel_title: string; channel_url: string | null;
  published_at: string | null; country: string | null; language: string | null;
  subscriber_count: number | string | null; video_count: number | string | null;
  view_count: number | string | null; is_active: boolean; is_manual_priority?: boolean;
  ai_production_status: "needs_review" | "qualified" | "rejected";
  ai_production_evidence: { sampleVideos?: SampleVideo[]; aiScreening?: AIScreening; confidenceScore?: number; nicheRelevance?: number } | null;
  ai_production_review_note: string | null;
};
type ManualLink = { id:string; platform:"youtube"|"instagram"; url:string; display_name:string; is_active:boolean; monitoring_status?:string; last_checked_at?:string|null; next_check_at?:string|null; last_error?:string|null };
type DiscoveryQuotaBucket = { remaining: number };
type DiscoveryResult = {
  saved?: number;
  channelsDiscovered?: number;
  quota?: { search?: DiscoveryQuotaBucket; general?: DiscoveryQuotaBucket } | null;
};
type ScreenResponse = { error?: string; screening?: AIScreening };

const defaultKeywords = [
  "AI engineer production LLM systems implementation",
  "LLM engineer build deploy production applications",
  "AI solutions architect enterprise generative AI architecture",
  "enterprise solutions architect AI integration systems",
  "AI engineering manager LLM platform engineering",
  "production RAG architecture retrieval evaluation implementation",
  "agentic AI systems LangGraph orchestration production",
  "LLMOps MLOps AI platform engineering deployment",
  "LLM inference serving GPU infrastructure optimization",
  "AI system design scalable production architecture",
  "enterprise AI copilot backend API integration",
  "vector database embeddings retrieval system architecture",
  "LLM observability evaluation tracing reliability security",
  "cloud AI architecture AWS Azure Google Vertex AI engineering",
].join(String.fromCharCode(10));
function compact(value: number | string | null) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number) : "—";
}
function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "Unknown";
}

export default function CompetitorExplorerPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [manualLinks,setManualLinks]=useState<ManualLink[]>([]);
  const [manualUrl,setManualUrl]=useState("");
  const [manualName,setManualName]=useState("");
  const [manualBusy,setManualBusy]=useState(false);
  const [language, setLanguage] = useState<"hi" | "en">("en");
  const [keywords, setKeywords] = useState(defaultKeywords);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastDiscovery, setLastDiscovery] = useState<DiscoveryResult | null>(null);
  const [screeningId, setScreeningId] = useState<string | null>(null);
  const [screenResults, setScreenResults] = useState<Record<string, AIScreening>>({});

  const loadCompetitors = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/competitors/refresh", { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load competitors.");
      const rows: Competitor[] = result.competitors ?? [];
      const manualResponse=await fetch("/api/manual-tracked-channels",{cache:"no-store"});
      const manualResult=await manualResponse.json();
      if(!manualResponse.ok) throw new Error(manualResult.error||"Could not load manually tracked links.");
      setManualLinks(manualResult.items??[]);
      // Keep rejected and explicitly low-confidence candidates out of the refreshed list.
      // Records remain in Supabase so review history is preserved.
      const visibleRows = rows.filter((item) => {
        if (item.ai_production_status === "rejected") return false;
        const confidence = item.ai_production_evidence?.confidenceScore;
        const relevance = item.ai_production_evidence?.nicheRelevance;
        if (item.is_manual_priority) return true;
        return !(
          (typeof confidence === "number" && confidence < 81) ||
          (typeof relevance === "number" && relevance < 81)
        );
      });
      setCompetitors(visibleRows);
      const screenings: Record<string, AIScreening> = {};
      for (const item of visibleRows) {
        const screening = item.ai_production_evidence?.aiScreening;
        if (screening) screenings[item.id] = screening;
      }
      setScreenResults(screenings);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load competitors."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadCompetitors(); }, [loadCompetitors]);

  const activeCount = competitors.filter((item) => item.is_active).length;
  const visible = useMemo(() => competitors.filter((item) => {
    const matchesFilter = filter === "all" || (filter === "active" ? item.is_active : !item.is_active);
    const term = search.trim().toLowerCase();
    return matchesFilter && (!term || item.channel_title.toLowerCase().includes(term) || item.youtube_channel_id.toLowerCase().includes(term));
  }), [competitors, filter, search]);

  async function addManualLink(){setManualBusy(true);setError("");setNotice("");try{const response=await fetch("/api/manual-tracked-channels",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:manualUrl,display_name:manualName})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not add link.");setManualLinks(current=>[result.item,...current.filter(x=>x.id!==result.item.id)]);setManualUrl("");setManualName("");setNotice(result.priority ? result.channelTitle + " added as a manual priority channel. It bypasses AI niche scoring and is scheduled for daily monitoring." : "Instagram profile link saved. Open Instagram Discovery to retrieve available posts through Meta Business Discovery.");
      await loadCompetitors();}catch(err){setError(err instanceof Error?err.message:"Could not add link.");}finally{setManualBusy(false);}}
  async function toggleManualLink(link:ManualLink){try{const response=await fetch("/api/manual-tracked-channels",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:link.id,is_active:!link.is_active})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not update tracking.");setManualLinks(current=>current.map(x=>x.id===link.id?result.item:x));await loadCompetitors();}catch(err){setError(err instanceof Error?err.message:"Could not update tracking.");}}
  async function removeManualLink(id:string){try{const response=await fetch("/api/manual-tracked-channels?id="+encodeURIComponent(id),{method:"DELETE"});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not remove link.");setManualLinks(current=>current.filter(x=>x.id!==id));await loadCompetitors();}catch(err){setError(err instanceof Error?err.message:"Could not remove link.");}}

  async function discover() {
    const keywordList = Array.from(new Set(keywords.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)));
    if (!keywordList.length) { setError("Enter at least one keyword."); return; }
    setDiscovering(true); setError(""); setNotice(""); setLastDiscovery(null);
    try {
      const response = await fetch("/api/competitors/discover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, keywords: keywordList }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Discovery failed.");
      setLastDiscovery(result);
      setNotice("Discovery complete: " + result.saved + " channel records upserted from " + result.channelsDiscovered + " channels found. " + (result.channelsFilteredByAI ?? 0) + " filtered by AI; " + (result.channelsPendingScreening ?? 0) + " pending screening. Existing user decisions were preserved.");
      await loadCompetitors();
    } catch (err) { setError(err instanceof Error ? err.message : "Discovery failed."); }
    finally { setDiscovering(false); }
  }

  async function runAIScreen(item: Competitor) {
    setScreeningId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/competitors/screen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const responseText = await response.text();
      let result: ScreenResponse = {};
      if (responseText.trim()) {
        try { result = JSON.parse(responseText); }
        catch { throw new Error(`AI screening returned an invalid response (HTTP ${response.status}): ${responseText.slice(0, 300)}`); }
      } else {
        throw new Error(`AI screening returned an empty response (HTTP ${response.status}). Check the terminal running npm run dev for the server error, then share that error text.`);
      }
      if (!response.ok) throw new Error(result.error || `AI screening failed (HTTP ${response.status}).`);
      if (!result.screening) throw new Error("The screening API response did not contain an assessment.");
      setScreenResults((current) => ({ ...current, [item.id]: result.screening as AIScreening }));
      setNotice("Creator assessment completed for " + item.channel_title + ". Review the evidence before making a manual decision.");
    } catch (err) { setError(err instanceof Error ? err.message : "AI screening failed."); }
    finally { setScreeningId(null); }
  }

  async function reviewAI(item: Competitor, status: "qualified" | "rejected") {
    const note = status === "qualified"
      ? "Manually reviewed sample videos; creator consistently teaches AI systems architecture and engineering to IT professionals."
      : "Manually reviewed sample videos; creator does not match the AI systems architecture education niche.";
    setUpdatingId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/competitors", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, ai_production_status: status, ai_production_review_note: note }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save review.");
      setCompetitors((current) => current.map((row) => row.id === item.id ? {
        ...row, ai_production_status: result.competitor.ai_production_status,
        is_active: result.competitor.is_active,
        ai_production_review_note: result.competitor.ai_production_review_note,
      } : row));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save review."); }
    finally { setUpdatingId(null); }
  }

  async function toggleCompetitor(item: Competitor) {
    setUpdatingId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/competitors", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update competitor.");
      setCompetitors((current) => current.map((row) => row.id === item.id ? { ...row, is_active: result.competitor.is_active } : row));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update competitor."); }
    finally { setUpdatingId(null); }
  }

  return <main className="min-h-screen bg-[#090d14] text-slate-100"><div className="mx-auto max-w-[1440px] p-4 md:p-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><Link href="/" className="mb-3 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={14}/>Dashboard</Link><div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-300"><Target size={22}/></div><div><h1 className="text-2xl font-semibold">Competitor Explorer</h1><p className="mt-1 text-sm text-slate-400">Find professional AI engineers, LLM engineers, AI/solutions architects and technical leaders who build and operate production AI systems. Children&apos;s content and finance/trading channels are excluded.</p></div></div></div><button onClick={() => void loadCompetitors()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>Refresh list</button></div>

    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-[#111925] p-4"><div className="text-xs text-slate-400">Active competitors</div><div className="mt-2 text-2xl font-semibold">{activeCount}<span className="ml-1 text-sm font-normal text-slate-500">/ 100</span></div></div>
      <div className="rounded-xl border border-slate-800 bg-[#111925] p-4"><div className="text-xs text-slate-400">Saved channels</div><div className="mt-2 text-2xl font-semibold">{competitors.length}</div></div>
      <div className="rounded-xl border border-slate-800 bg-[#111925] p-4"><div className="text-xs text-slate-400">Available active slots</div><div className="mt-2 text-2xl font-semibold">{Math.max(0,100-activeCount)}</div></div>
    </div>

    <section className="mb-6 rounded-xl border border-slate-800 bg-[#111925] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Discover competitors</h2><p className="mt-1 text-xs text-slate-400">Targets practical AI engineering, enterprise architecture, production LLM/RAG, agents, inference, LLMOps and AI platform engineering. Kids/entertainment and finance/trading terms are excluded before AI screening.</p></div><span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300">Global creator discovery</span></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div><label className="mb-2 block text-xs text-slate-400">Search relevance language</label><select value={language} onChange={(event)=>setLanguage(event.target.value as "hi"|"en")} className="w-full rounded-lg border border-slate-700 bg-[#0b121d] px-3 py-2.5 text-sm outline-none focus:border-cyan-500"><option value="hi">Hindi</option><option value="en">English</option></select><p className="mt-2 text-[10px] leading-4 text-slate-500">This affects YouTube search relevance. It does not verify the channel&apos;s actual spoken language.</p></div>
        <div><label className="mb-2 block text-xs text-slate-400">Keywords (one per line or comma-separated)</label><textarea value={keywords} onChange={(event)=>setKeywords(event.target.value)} rows={4} className="w-full resize-y rounded-lg border border-slate-700 bg-[#0b121d] px-3 py-2.5 text-sm outline-none focus:border-cyan-500" placeholder={"AI system design\nRAG architecture and LLM engineering"}/></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-[11px] text-slate-500">Prioritizes professional AI engineering and solution architecture. Search-level exclusions remove obvious kids and finance/trading results; AI then checks up to three sample videos for practical engineering depth. Only channels with at least 40/100 confidence and 40/100 niche relevance pass. Existing channels are refreshed when you run discovery again. AI-generated narration and visuals still require human verification.</p><button onClick={() => void discover()} disabled={discovering} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">{discovering?<Loader2 size={16} className="animate-spin"/>:<Search size={16}/>} {discovering?"Scanning YouTube...":"Discover creators / Scan again"}</button></div>
    </section>

    {error && <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0"/><span>{error}</span></div>}
    {notice && <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}{lastDiscovery?.quota?.search && lastDiscovery.quota.general && <div className="mt-1 text-xs text-emerald-200/70">Search quota remaining: {lastDiscovery.quota.search.remaining} · General units remaining: {lastDiscovery.quota.general.remaining}</div>}</div>}

    <section className="mb-6 rounded-xl border border-cyan-500/20 bg-[#111925] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Manually tracked social channels</h2><p className="mt-1 text-xs text-slate-400">YouTube channels are promoted into your approved competitor list and monitored in a daily priority batch (up to 20 channels per run). Manual approval bypasses AI niche scoring; children’s and stock/share-market/trading channels remain blocked. Larger lists are processed in queued daily batches. Instagram profile URLs can be saved here; use Instagram Discovery to connect your professional account and retrieve eligible public Business/Creator posts.</p></div><Link href="/instagram" className="text-xs text-cyan-300 underline">Open Instagram Discovery</Link></div>
      <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]"><input value={manualUrl} onChange={e=>setManualUrl(e.target.value)} placeholder="Paste YouTube or Instagram URL" className="rounded-lg border border-slate-700 bg-[#0b121d] px-3 py-2 text-sm"/><input value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="Display name (optional)" className="rounded-lg border border-slate-700 bg-[#0b121d] px-3 py-2 text-sm"/><button onClick={()=>void addManualLink()} disabled={manualBusy||!manualUrl.trim()} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{manualBusy?"Adding...":"Add link"}</button></div>
      {manualLinks.length>0&&<div className="mt-4 space-y-2">{manualLinks.map(link=><div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0b121d] px-3 py-2"><div className="min-w-0"><span className="mr-2 rounded bg-slate-800 px-2 py-1 text-[10px] uppercase text-cyan-300">{link.platform}</span><span className="text-xs font-medium">{link.display_name}</span><a href={link.url} target="_blank" rel="noreferrer" className="ml-2 break-all text-[10px] text-sky-300 underline">{link.url}</a><div className="mt-1 text-[10px] text-slate-500">{link.platform==="youtube"?(link.is_active?(link.monitoring_status==="needs_resolution"?"Re-add this URL to enable monitoring":"Priority monitoring · "+(link.monitoring_status||"queued")):"Paused"):"Saved only · monitoring unavailable"}{link.last_checked_at?" · Last checked "+new Date(link.last_checked_at).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):""}{link.last_error?" · "+link.last_error:""}</div></div><div className="flex gap-3"><button onClick={()=>void toggleManualLink(link)} className="text-xs text-cyan-300 hover:text-cyan-200">{link.is_active?"Pause":"Resume"}</button><button onClick={()=>void removeManualLink(link.id)} className="text-xs text-red-300 hover:text-red-200">Remove</button></div></div>)}</div>}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#111925]">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-4 md:flex-row md:items-center"><div><h2 className="text-sm font-semibold">Tracked channels</h2><p className="mt-1 text-xs text-slate-400">Pause channels to free active slots without deleting their records.</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-500"/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Find channel..." className="w-full rounded-lg border border-slate-700 bg-[#0b121d] py-2 pl-8 pr-3 text-xs outline-none focus:border-cyan-500 sm:w-52"/></div><select value={filter} onChange={(event)=>setFilter(event.target.value as typeof filter)} className="rounded-lg border border-slate-700 bg-[#0b121d] px-3 py-2 text-xs"><option value="all">All channels</option><option value="active">Active</option><option value="paused">Paused</option></select></div></div>
      {loading ? <div className="p-12 text-center text-sm text-slate-400"><Loader2 size={18} className="mx-auto mb-2 animate-spin"/>Loading creators...</div> : visible.length===0 ? <div className="p-12 text-center"><Users size={24} className="mx-auto mb-3 text-slate-600"/><p className="text-sm font-medium">{competitors.length===0?"No creators saved yet":"No creators match these filters"}</p><p className="mt-1 text-xs text-slate-500">Run creator discovery above to find relevant channels.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[#0d1520] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Subscribers</th><th className="px-4 py-3">Videos</th><th className="px-4 py-3">Total views</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Niche fit review</th><th className="px-4 py-3">Tracking</th></tr></thead><tbody className="divide-y divide-slate-800">{visible.map((item)=>{ const assessment = screenResults[item.id] ?? item.ai_production_evidence?.aiScreening; const assessmentEvidence = assessment?.evidence ?? []; return (<tr key={item.id} className="hover:bg-white/[.02]"><td className="max-w-[320px] px-4 py-3"><div className="flex items-center gap-2"><div className="truncate text-sm font-medium">{item.channel_title}</div>{item.is_manual_priority&&<span className="shrink-0 rounded bg-cyan-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-cyan-300">Manual priority</span>}</div><div className="mt-1 truncate text-[10px] text-slate-500">{item.youtube_channel_id}{item.country?" · "+item.country:""} · {item.language?.toUpperCase()||"—"}</div></td><td className="px-4 py-3 text-xs tabular-nums">{compact(item.subscriber_count)}</td><td className="px-4 py-3 text-xs tabular-nums">{compact(item.video_count)}</td><td className="px-4 py-3 text-xs tabular-nums">{compact(item.view_count)}</td><td className="px-4 py-3 text-xs text-slate-400">{dateLabel(item.published_at)}</td><td className="max-w-[330px] px-4 py-3"><span className={"rounded-full px-2 py-1 text-[10px] "+(item.ai_production_status==="qualified"?"bg-emerald-500/10 text-emerald-300":item.ai_production_status==="rejected"?"bg-red-500/10 text-red-300":"bg-cyan-500/10 text-cyan-300")}>{item.ai_production_status==="qualified"?"Relevant creator · reviewed":item.ai_production_status==="rejected"?"Low niche fit":"Needs review"}</span><div className="mt-2 flex flex-wrap gap-2">{(item.ai_production_evidence?.sampleVideos??[]).slice(0,3).map((video,index)=>video.videoUrl?<a key={video.videoUrl} href={video.videoUrl} target="_blank" rel="noreferrer" className="text-[10px] text-sky-300 underline">Sample {index+1}: {video.title.slice(0,32)}</a>:null)}</div>{item.ai_production_status!=="rejected"&&<div className="mt-2 flex flex-wrap gap-2"><button onClick={()=>void runAIScreen(item)} disabled={screeningId===item.id} className="inline-flex items-center gap-1 rounded border border-violet-700 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-200 disabled:opacity-50">{screeningId===item.id?<Loader2 size={11} className="animate-spin"/>:<Sparkles size={11}/>} AI Assess</button>{item.ai_production_status==="needs_review"&&<><button onClick={()=>void reviewAI(item,"qualified")} disabled={updatingId===item.id} className="rounded border border-emerald-700 px-2 py-1 text-[10px] text-emerald-300 disabled:opacity-50">Confirm creator fit</button><button onClick={()=>void reviewAI(item,"rejected")} disabled={updatingId===item.id} className="rounded border border-red-900 px-2 py-1 text-[10px] text-red-300 disabled:opacity-50">Reject</button></>}</div>}{assessment&&<div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-[10px] leading-5"><div className="mb-1 font-semibold text-violet-200">AI assessment: {assessment.recommendation?.replaceAll("_"," ")}</div><div className="grid grid-cols-2 gap-x-3 text-slate-300"><span>AI systems relevance: {assessment.industrialRelevance}/100</span><span>Technical teaching fit: {assessment.facelessFormatLikelihood}/100</span><span>Architecture depth: {assessment.syntheticVisualStyleLikelihood}/100</span><span>Narration: {assessment.narrationEvidence?.replaceAll("_"," ")}</span></div>{assessmentEvidence.length>0&&<ul className="mt-2 list-disc pl-4 text-slate-400">{assessmentEvidence.map((entry:string,index:number)=><li key={index}>{entry}</li>)}</ul>}<p className="mt-2 text-slate-500">Advisory only. Review technical accuracy and teaching quality by watching sample videos.</p></div>}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><span className={"rounded-full px-2 py-1 text-[10px] "+(item.is_active?"bg-emerald-500/10 text-emerald-300":"bg-slate-700 text-slate-400")}>{item.ai_production_status==="needs_review"?"Review pending":item.ai_production_status==="rejected"?"Rejected":item.is_active?"Active":"Paused"}</span>{item.channel_url&&<a href={item.channel_url} target="_blank" rel="noreferrer" title="Open YouTube channel" className="rounded-md border border-slate-700 p-2 text-slate-400 hover:text-white"><ExternalLink size={14}/></a>}<button onClick={()=>void toggleCompetitor(item)} disabled={updatingId===item.id || item.ai_production_status!=="qualified"} title={item.ai_production_status!=="qualified"?"Qualify this channel before tracking":item.is_active?"Pause tracking":"Resume tracking"} className="rounded-md border border-slate-700 p-2 text-slate-400 hover:text-cyan-300 disabled:opacity-50">{updatingId===item.id?<Loader2 size={14} className="animate-spin"/>:<Power size={14}/>}</button></div></td></tr>);})}</tbody></table></div>}
    </section>
    <p className="mt-4 text-[10px] leading-5 text-slate-500">Niche-fit labels are review decisions, not proof of teaching quality. Check several videos for technical accuracy, depth, clarity, practical examples and relevance to AI systems engineering. Search relevance language does not confirm spoken language. Paused channels remain stored.</p>
  </div></main>;
}
