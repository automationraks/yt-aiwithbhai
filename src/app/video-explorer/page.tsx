"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Video, Eye, ThumbsUp, MessageCircle, CheckCircle2 } from "lucide-react";

type VideoRow = {
  id: string; youtube_video_id: string; title: string; description: string | null;
  published_at: string | null; duration_seconds: number | null; view_count: number | null;
  like_count: number | null; comment_count: number | null; is_short: boolean;
  thumbnail_url: string | null; video_url: string | null; niche_relevance_score: number | null;
  niche_relevance_reason: string | null; channelTitle: string; channelUrl: string | null;
};
type Summary = { activeChannels: number; matchedVideos: number; totalViews: number; totalLikes: number; totalComments: number };
const emptySummary: Summary = { activeChannels: 0, matchedVideos: 0, totalViews: 0, totalLikes: 0, totalComments: 0 };
function compact(value: number) { return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function dateLabel(value: string | null) { return value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Date unavailable"; }

export default function VideoExplorerPage() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/video-explorer", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load Video Explorer.");
      setVideos(result.videos ?? []); setSummary(result.summary ?? emptySummary);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load videos."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/competitors/intelligence/refresh", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Video refresh failed.");
      setMessage(`Scanned ${result.activeChannelsScanned ?? result.processed ?? 0} active channels. ${result.videosMatchedNiche ?? 0} videos matched your niche; ${result.videosExcludedAsOffNiche ?? 0} off-niche videos were excluded. Updated ${result.processed ?? 0} channel metric records.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Video refresh failed."); }
    finally { setRefreshing(false); }
  }

  return <main className="min-h-screen bg-[#090d14] p-4 text-slate-100 md:p-8"><div className="mx-auto max-w-[1440px]">
    <Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={14}/>Dashboard</Link>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs text-cyan-300"><Video size={14}/> NICHE-BASED VIDEO RESEARCH</div><h1 className="text-2xl font-semibold">Video Explorer</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Scans only approved, active channels. AI classifies each recent upload against AIWithBh@i&apos;s AI systems design and engineering niche. Off-topic videos are excluded from this view and content recommendations.</p></div><button onClick={() => void refresh()} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">{refreshing ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>} {refreshing ? "Scanning active channels..." : "Refresh videos & metrics"}</button></div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[["Active channels", summary.activeChannels], ["Niche-matched videos", summary.matchedVideos], ["Combined views", compact(summary.totalViews)], ["Combined likes", compact(summary.totalLikes)], ["Combined comments", compact(summary.totalComments)]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-[#111925] p-4"><div className="text-xs text-slate-400">{label}</div><div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div></div>)}
    </div>

    <div className="mb-5 flex items-start gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[.06] p-4 text-xs leading-5 text-slate-300"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-cyan-300"/><p>Each refresh processes up to 10 active channels to control YouTube API quota. It checks the latest five uploads plus Creator Explorer sample videos per channel, refreshes public video/channel metrics, and stores the AI niche score. Repeat refresh to process the next batch. Public metrics do not include watch time, CTR or revenue.</p></div>

    {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    {message && <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}

    <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#111925]"><div className="border-b border-slate-800 px-5 py-4"><h2 className="text-sm font-semibold">Videos matching AIWithBh@i niche</h2><p className="mt-1 text-xs text-slate-400">Sorted by latest publication date · AI relevance threshold 81/100</p></div>
      {loading ? <div className="p-12 text-center text-sm text-slate-400"><Loader2 size={18} className="mx-auto mb-2 animate-spin"/>Loading niche-matched videos...</div> : videos.length === 0 ? <div className="p-12 text-center"><Video size={24} className="mx-auto mb-3 text-slate-600"/><p className="text-sm font-medium">No niche-matched videos saved yet</p><p className="mt-1 text-xs text-slate-500">Approve channels in <Link href="/competitors" className="text-cyan-300 underline">Creator Explorer</Link>, then run Refresh videos & metrics.</p></div> : <div className="divide-y divide-slate-800">{videos.map((video) => <article key={video.youtube_video_id} className="flex flex-col gap-4 p-4 md:flex-row">
        {video.thumbnail_url && <a href={video.video_url ?? "#"} target="_blank" rel="noreferrer" className="block w-full shrink-0 overflow-hidden rounded-lg bg-slate-900 md:w-48"><img src={video.thumbnail_url} alt="" className="aspect-video w-full object-cover"/></a>}
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">Niche match · {video.niche_relevance_score ?? "—"}/100</span><span className="rounded-full bg-slate-700 px-2 py-1 text-[10px] text-slate-300">{video.is_short ? "Short" : "Long-form"}</span><span className="text-[10px] text-slate-500">{dateLabel(video.published_at)}</span></div>
          <a href={video.video_url ?? "#"} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-semibold text-slate-100 hover:text-cyan-300">{video.title} <ExternalLink size={12} className="ml-1 inline"/></a>
          <div className="mt-1 text-xs text-slate-400">{video.channelUrl ? <a href={video.channelUrl} target="_blank" rel="noreferrer" className="hover:text-cyan-300">{video.channelTitle}</a> : video.channelTitle}</div>
          {video.niche_relevance_reason && <p className="mt-2 text-xs leading-5 text-slate-500">{video.niche_relevance_reason}</p>}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400"><span className="inline-flex items-center gap-1"><Eye size={13}/>{compact(Number(video.view_count ?? 0))} views</span><span className="inline-flex items-center gap-1"><ThumbsUp size={13}/>{compact(Number(video.like_count ?? 0))} likes</span><span className="inline-flex items-center gap-1"><MessageCircle size={13}/>{compact(Number(video.comment_count ?? 0))} comments</span></div>
        </div>
      </article>)}</div>}
    </section>
  </div></main>;
}
