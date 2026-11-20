"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Search, Target, Users, RefreshCw, Power, AlertCircle, Sparkles } from "lucide-react";

type Competitor = {
  id: string; youtube_channel_id: string; channel_title: string; channel_url: string | null;
  published_at: string | null; country: string | null; language: string | null;
  subscriber_count: number | string | null; video_count: number | string | null;
  view_count: number | string | null; is_active: boolean;
  ai_production_status: "needs_review" | "qualified" | "rejected";
  ai_production_evidence: { sampleVideos?: Array<{ title: string; videoUrl: string | null; thumbnailUrl: string | null; matchedQuery: string }>; aiScreening?: Record<string, any> } | null;
  ai_production_review_note: string | null;
};

const defaultKeywords = [
  "AI system design for software engineers",
  "LLM application architecture explained",
  "RAG architecture vector databases tutorial",
  "AI agent architecture orchestration",
  "production AI systems engineering",
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
  const [language, setLanguage] = useState<"hi" | "en">("en");
  const [keywords, setKeywords] = useState(defaultKeywords);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastDiscovery, setLastDiscovery] = useState<any>(null);
  const [screeningId, setScreeningId] = useState<string | null>(null);
  const [screenResults, setScreenResults] = useState<Record<string, any>>({});

  const loadCompetitors = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/competitors", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load competitors.");
      const rows = result.competitors ?? [];
      setCompetitors(rows);
      setScreenResults(Object.fromEntries(rows.filter((item: Competitor) => item.ai_production_evidence?.aiScreening).map((item: Competitor) => [item.id, item.ai_production_evidence?.aiScreening])));
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
      setNotice("Discovery complete: " + result.saved + " new review candidates added from " + result.channelsDiscovered + " channels found.");
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
      let result: any = {};
      if (responseText.trim()) {
        try { result = JSON.parse(responseText); }
        catch { throw new Error(`AI screening returned an invalid response (HTTP ${response.status}): ${responseText.slice(0, 300)}`); }
      } else {
        throw new Error(`AI screening returned an empty response (HTTP ${response.status}). Check the terminal running npm run dev for the server error, then share that error text.`);
      }
      if (!response.ok) throw new Error(result.error || `AI screening failed (HTTP ${response.status}).`);
      if (!result.screening) throw new Error("The screening API response did not contain an assessment.");
      setScreenResults((current) => ({ ...current, [item.id]: result.screening }));
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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><Link href="/" className="mb-3 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={14}/>Dashboard</Link><div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-300"><Target size={22}/></div><div><h1 className="text-2xl font-semibold">Competitor Explorer</h1><p className="mt-1 text-sm text-slate-400">Find AI systems and engineering educators, then manually verify AI systems education niche.</p></div></div></div><button onClick={() => void loadCompetitors()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>Refresh list</button></div>

    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-[#111925] p-4"><div className="text-xs text-slate-400">Active competitors</div><div className="mt-2 text-2xl font-semibold">{activeCount}<span className="ml-1 text-sm font-normal text-slate-500">/ 100</span></div></div>
      <div className="rounded-xl border border-slate-800 bg-[#111925] p-4"><div className="text-xs text-slate-400">Saved channels</div><div className="mt-2 text-2xl font-semibold">{competitors.length}</div></div>
      <div className="rounded-xl border border-slate-800 bg-[#111925] p-4"><div className="text-xs text-slate-400">Available active slots</div><div className="mt-2 text-2xl font-semibold">{Math.max(0,100-activeCount)}</div></div>
    </div>

    <section className="mb-6 rounded-xl border border-slate-800 bg-[#111925] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Discover competitors</h2><p className="mt-1 text-xs text-slate-400">Searches video titles and descriptions using every keyword you provide. Each keyword uses one YouTube search request; the daily API quota still applies.</p></div><span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300">Global creator discovery</span></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div><label className="mb-2 block text-xs text-slate-400">Search relevance language</label><select value={language} onChange={(event)=>setLanguage(event.target.value as "hi"|"en")} className="w-full rounded-lg border border-slate-700 bg-[#0b121d] px-3 py-2.5 text-sm outline-none focus:border-cyan-500"><option value="hi">Hindi</option><option value="en">English</option></select><p className="mt-2 text-[10px] leading-4 text-slate-500">This affects YouTube search relevance. It does not verify the channel's actual spoken language.</p></div>
        <div><label className="mb-2 block text-xs text-slate-400">Keywords (one per line or comma-separated)</label><textarea value={keywords} onChange={(event)=>setKeywords(event.target.value)} rows={4} className="w-full resize-y rounded-lg border border-slate-700 bg-[#0b121d] px-3 py-2.5 text-sm outline-none focus:border-cyan-500" placeholder={"AI system design\nRAG architecture and LLM engineering"}/></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-[11px] text-slate-500">Candidates are not confirmed AI channels. Public metadata cannot prove AI voiceovers or generated visuals; inspect the sample videos before approving.</p><button onClick={() => void discover()} disabled={discovering || activeCount>=100} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">{discovering?<Loader2 size={16} className="animate-spin"/>:<Search size={16}/>} {discovering?"Discovering...":"Discover creators"}</button></div>
    </section>

    {error && <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0"/><span>{error}</span></div>}
    {notice && <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}{lastDiscovery?.quota && <div className="mt-1 text-xs text-emerald-200/70">Search quota remaining: {lastDiscovery.quota.search.remaining} · General units remaining: {lastDiscovery.quota.general.remaining}</div>}</div>}

    <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#111925]">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-4 md:flex-row md:items-center"><div><h2 className="text-sm font-semibold">Tracked channels</h2><p className="mt-1 text-xs text-slate-400">Pause channels to free active slots without deleting their records.</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-500"/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Find channel..." className="w-full rounded-lg border border-slate-700 bg-[#0b121d] py-2 pl-8 pr-3 text-xs outline-none focus:border-cyan-500 sm:w-52"/></div><select value={filter} onChange={(event)=>setFilter(event.target.value as typeof filter)} className="rounded-lg border border-slate-700 bg-[#0b121d] px-3 py-2 text-xs"><option value="all">All channels</option><option value="active">Active</option><option value="paused">Paused</option></select></div></div>
      {loading ? <div className="p-12 text-center text-sm text-slate-400"><Loader2 size={18} className="mx-auto mb-2 animate-spin"/>Loading creators...</div> : visible.length===0 ? <div className="p-12 text-center"><Users size={24} className="mx-auto mb-3 text-slate-600"/><p className="text-sm font-medium">{competitors.length===0?"No creators saved yet":"No creators match these filters"}</p><p className="mt-1 text-xs text-slate-500">Run creator discovery above to find relevant channels.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[#0d1520] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Subscribers</th><th className="px-4 py-3">Videos</th><th className="px-4 py-3">Total views</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Niche fit review</th><th className="px-4 py-3">Tracking</th></tr></thead><tbody className="divide-y divide-slate-800">{visible.map((item)=><tr key={item.id} className="hover:bg-white/[.02]"><td className="max-w-[320px] px-4 py-3"><div className="truncate text-sm font-medium">{item.channel_title}</div><div className="mt-1 truncate text-[10px] text-slate-500">{item.youtube_channel_id}{item.country?" · "+item.country:""} · {item.language?.toUpperCase()||"—"}</div></td><td className="px-4 py-3 text-xs tabular-nums">{compact(item.subscriber_count)}</td><td className="px-4 py-3 text-xs tabular-nums">{compact(item.video_count)}</td><td className="px-4 py-3 text-xs tabular-nums">{compact(item.view_count)}</td><td className="px-4 py-3 text-xs text-slate-400">{dateLabel(item.published_at)}</td><td className="max-w-[330px] px-4 py-3"><span className={"rounded-full px-2 py-1 text-[10px] "+(item.ai_production_status==="qualified"?"bg-emerald-500/10 text-emerald-300":item.ai_production_status==="rejected"?"bg-red-500/10 text-red-300":"bg-cyan-500/10 text-cyan-300")}>{item.ai_production_status==="qualified"?"Relevant creator · reviewed":item.ai_production_status==="rejected"?"Low niche fit":"Needs review"}</span><div className="mt-2 flex flex-wrap gap-2">{(item.ai_production_evidence?.sampleVideos??[]).slice(0,3).map((video,index)=>video.videoUrl?<a key={video.videoUrl} href={video.videoUrl} target="_blank" rel="noreferrer" className="text-[10px] text-sky-300 underline">Sample {index+1}: {video.title.slice(0,32)}</a>:null)}</div>{item.ai_production_status!=="rejected"&&<div className="mt-2 flex flex-wrap gap-2"><button onClick={()=>void runAIScreen(item)} disabled={screeningId===item.id} className="inline-flex items-center gap-1 rounded border border-violet-700 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-200 disabled:opacity-50">{screeningId===item.id?<Loader2 size={11} className="animate-spin"/>:<Sparkles size={11}/>} AI Assess</button>{item.ai_production_status==="needs_review"&&<><button onClick={()=>void reviewAI(item,"qualified")} disabled={updatingId===item.id} className="rounded border border-emerald-700 px-2 py-1 text-[10px] text-emerald-300 disabled:opacity-50">Confirm creator fit</button><button onClick={()=>void reviewAI(item,"rejected")} disabled={updatingId===item.id} className="rounded border border-red-900 px-2 py-1 text-[10px] text-red-300 disabled:opacity-50">Reject</button></>}</div>}{(screenResults[item.id] ?? item.ai_production_evidence?.aiScreening)&&<div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-[10px] leading-5"><div className="mb-1 font-semibold text-violet-200">AI assessment: {(screenResults[item.id] ?? item.ai_production_evidence?.aiScreening).recommendation?.replaceAll("_"," ")}</div><div className="grid grid-cols-2 gap-x-3 text-slate-300"><span>AI systems relevance: {(screenResults[item.id] ?? item.ai_production_evidence?.aiScreening).industrialRelevance}/100</span><span>Technical teaching fit: {(screenResults[item.id] ?? item.ai_production_evidence?.aiScreening).facelessFormatLikelihood}/100</span><span>Architecture depth: {(screenResults[item.id] ?? item.ai_production_evidence?.aiScreening).syntheticVisualStyleLikelihood}/100</span><span>Narration: {(screenResults[item.id] ?? item.ai_production_evidence?.aiScreening).narrationEvidence?.replaceAll("_"," ")}</span></div>{(screenResults[item.id] ?? item.ai_production_evidence?.aiScreening).evidence?.length>0&&<ul className="mt-2 list-disc pl-4 text-slate-400">{(screenResults[item.id] ?? item.ai_production_evidence?.aiScreening).evidence.map((entry:string,index:number)=><li key={index}>{entry}</li>)}</ul>}<p className="mt-2 text-slate-500">Advisory only. Review technical accuracy and teaching quality by watching sample videos.</p></div>}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><span className={"rounded-full px-2 py-1 text-[10px] "+(item.is_active?"bg-emerald-500/10 text-emerald-300":"bg-slate-700 text-slate-400")}>{item.ai_production_status==="needs_review"?"Review pending":item.ai_production_status==="rejected"?"Rejected":item.is_active?"Active":"Paused"}</span>{item.channel_url&&<a href={item.channel_url} target="_blank" rel="noreferrer" title="Open YouTube channel" className="rounded-md border border-slate-700 p-2 text-slate-400 hover:text-white"><ExternalLink size={14}/></a>}<button onClick={()=>void toggleCompetitor(item)} disabled={updatingId===item.id || item.ai_production_status!=="qualified"} title={item.ai_production_status!=="qualified"?"Qualify this channel before tracking":item.is_active?"Pause tracking":"Resume tracking"} className="rounded-md border border-slate-700 p-2 text-slate-400 hover:text-cyan-300 disabled:opacity-50">{updatingId===item.id?<Loader2 size={14} className="animate-spin"/>:<Power size={14}/>}</button></div></td></tr>)}</tbody></table></div>}
    </section>
    <p className="mt-4 text-[10px] leading-5 text-slate-500">Niche-fit labels are review decisions, not proof of teaching quality. Check several videos for technical accuracy, depth, clarity, practical examples and relevance to AI systems engineering. Search relevance language does not confirm spoken language. Paused channels remain stored.</p>
  </div></main>;
}
