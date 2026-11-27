"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clipboard, Loader2, Palette, RefreshCw, Sparkles } from "lucide-react";

type CalendarItem = { id: string; title: string; status: string; scheduled_date: string | null };
type BrandPackage = {
  titleOptions?: string[]; selectedTitle?: string; description?: string; tags?: string[]; hashtags?: string[];
  pinnedComment?: string;
  thumbnailConcepts?: Array<{ concept: string; visual: string; textOverlay: string; composition: string }>;
  visualIdentity?: { palette: string[]; typography: string; editingStyle: string; bRollStyle: string };
  openingFrame?: string; chapters?: Array<{ timestamp: string; label: string }>; productionChecklist?: string[];
};
type Asset = { id: string; calendar_id: string; version: number; brand_package: BrandPackage; provider: string | null; status: string; created_at: string };
const panel = "rounded-xl border border-slate-800 bg-[#111925] p-5";
const copy = (value: string) => { void navigator.clipboard?.writeText(value); };

export default function BrandStudioPage() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/brand-studio", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load Brand Studio.");
      setItems(data.items ?? []); setAssets(data.assets ?? []);
      setSelected(current => current || data.items?.[0]?.id || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load Brand Studio."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const selectedItem = items.find(item => item.id === selected);
  const currentAsset = useMemo(() => assets.find(asset => asset.calendar_id === selected), [assets, selected]);
  const pkg = currentAsset?.brand_package;
  async function review(status: "approved" | "rejected") {
    if (!currentAsset) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/brand-studio", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: currentAsset.id, status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not review brand package.");
      setNotice(data.message || "Brand package review saved.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not review brand package."); }
    finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/brand-studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarId: selected }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate brand package.");
      setNotice("Brand package generated and saved as a draft. Review all assets before publishing.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate brand package."); }
    finally { setBusy(false); }
  }
  const tagsText = [...(pkg?.tags ?? []), ...(pkg?.hashtags ?? [])].join(", ");
  return <main className="min-h-screen bg-[#090d14] p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-6xl">
    <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs text-slate-400"><ArrowLeft size={14}/>Dashboard</Link>
    <div className="mb-7"><div className="mb-2 text-xs text-cyan-400">AIWITHBH@I · PUBLISHING</div><h1 className="text-2xl font-semibold">Brand Studio</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Turn an approved research-backed script into a consistent publishing package: titles, description, tags, thumbnail concepts and visual direction. Generated assets remain drafts until you review them.</p></div>
    <section className={panel}><div className="flex flex-wrap items-end gap-3"><label className="min-w-[260px] flex-1 text-xs text-slate-400">Select a Short<select value={selected} onChange={e => setSelected(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"><option value="">Choose a calendar item</option>{items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button onClick={() => void generate()} disabled={!selected || busy || loading} className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin"/> : <Sparkles size={15}/>}Generate brand package</button><button onClick={() => void load()} disabled={loading} className="rounded-lg border border-slate-700 p-2.5 text-slate-300 disabled:opacity-50" aria-label="Refresh"><RefreshCw size={16}/></button></div>
    {!loading && items.length === 0 && <p className="mt-4 text-sm text-amber-300">No calendar Shorts found. Add a Short in Content Calendar first.</p>}
    {selectedItem && <p className="mt-3 text-xs text-slate-500">Status: {selectedItem.status.replaceAll("_", " ")} · {selectedItem.scheduled_date || "Not scheduled"} · Brand output is linked to the latest saved script and its research snapshot.</p>}
    </section>
    {error && <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    {notice && <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}
    {loading ? <div className="py-16 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin"/>Loading Brand Studio...</div> : !pkg ? <div className={panel+" mt-5 py-12 text-center"}><Palette className="mx-auto mb-3 text-slate-500" size={26}/><h2 className="font-medium">No brand package yet</h2><p className="mt-2 text-sm text-slate-500">Choose a Short with a generated script, then generate its publishing assets.</p></div> : <div className="mt-5 space-y-5">
      <section className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Title options</h2><span className="text-xs text-slate-500">Version {currentAsset?.version} · {currentAsset?.status}</span></div>{currentAsset?.status === "draft" && <div className="flex gap-2"><button onClick={()=>void review("rejected")} disabled={busy} className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-300 disabled:opacity-50">Reject draft</button><button onClick={()=>void review("approved")} disabled={busy} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Approve brand package</button></div>}</div><div className="space-y-2">{(pkg.titleOptions ?? []).map((title, index) => <div key={index} className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 p-3"><span className="text-sm">{title}</span><button onClick={() => copy(title)} className="text-slate-400 hover:text-white" aria-label="Copy title"><Clipboard size={15}/></button></div>)}</div></section>
      <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">YouTube description</h2><button onClick={() => copy(pkg.description ?? "")} className="text-xs text-cyan-300"><Clipboard className="mr-1 inline" size={13}/>Copy</button></div><p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{pkg.description}</p></section>
      <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Tags and hashtags</h2><button onClick={() => copy(tagsText)} className="text-xs text-cyan-300"><Clipboard className="mr-1 inline" size={13}/>Copy all</button></div><div className="flex flex-wrap gap-2">{(pkg.tags ?? []).map(tag => <span key={tag} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{tag}</span>)}{(pkg.hashtags ?? []).map(tag => <span key={tag} className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">{tag}</span>)}</div><p className="mt-4 border-t border-slate-800 pt-3 text-sm text-slate-300"><strong className="text-slate-100">Pinned comment:</strong> {pkg.pinnedComment}</p></section>
      <section className={panel}><h2 className="mb-4 font-semibold">Thumbnail concepts</h2><div className="grid gap-3 md:grid-cols-3">{(pkg.thumbnailConcepts ?? []).map((concept, index) => <article key={index} className="rounded-lg border border-slate-800 bg-slate-900 p-4"><div className="mb-2 text-xs text-violet-300">CONCEPT {index+1}</div><h3 className="font-medium">{concept.concept}</h3><p className="mt-2 text-sm text-slate-400">{concept.visual}</p><p className="mt-3 text-xs text-cyan-300">Text: {concept.textOverlay}</p><p className="mt-2 text-xs text-slate-500">{concept.composition}</p></article>)}</div></section>
      <section className={panel}><h2 className="mb-4 flex items-center gap-2 font-semibold"><Palette size={17}/>Visual identity and edit direction</h2><div className="flex flex-wrap gap-2">{(pkg.visualIdentity?.palette ?? []).map(color => <span key={color} className="rounded-md border border-slate-700 px-3 py-2 text-xs">{color}</span>)}</div><div className="mt-4 grid gap-3 md:grid-cols-3"><div><div className="text-xs text-slate-500">Typography</div><p className="mt-1 text-sm">{pkg.visualIdentity?.typography}</p></div><div><div className="text-xs text-slate-500">Editing style</div><p className="mt-1 text-sm">{pkg.visualIdentity?.editingStyle}</p></div><div><div className="text-xs text-slate-500">B-roll style</div><p className="mt-1 text-sm">{pkg.visualIdentity?.bRollStyle}</p></div></div><p className="mt-4 text-sm text-slate-300"><strong>Opening frame:</strong> {pkg.openingFrame}</p></section>
      <section className={panel}><h2 className="mb-3 font-semibold">Production checklist</h2><ul className="space-y-2">{(pkg.productionChecklist ?? []).map((task, index) => <li key={index} className="text-sm text-slate-300"><Check className="mr-2 inline text-emerald-400" size={14}/>{task}</li>)}</ul>{(pkg.chapters ?? []).length > 0 && <div className="mt-4 border-t border-slate-800 pt-3"><h3 className="mb-2 text-xs font-semibold text-slate-400">Suggested timestamps</h3>{pkg.chapters?.map((chapter, index) => <p key={index} className="text-xs text-slate-400">{chapter.timestamp} · {chapter.label}</p>)}</div>}</section>
    </div>}
    {assets.filter(asset=>asset.calendar_id===selected).length>1 && <section className={panel+" mt-5"}><h2 className="mb-3 font-semibold">Brand package version history</h2><div className="space-y-2">{assets.filter(asset=>asset.calendar_id===selected).map(asset=><div key={asset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 p-3 text-xs"><span>Version {asset.version} · {new Date(asset.created_at).toLocaleString("en-IN")}</span><span className="uppercase text-slate-400">{asset.status}</span></div>)}</div></section>}
    <p className="mt-6 text-xs text-slate-500">Brand Studio uses the latest script and saved research snapshot for the selected Short. Approval records your review; publishing still requires a verified video and a separate platform schedule.</p>
  </div></main>;
}
