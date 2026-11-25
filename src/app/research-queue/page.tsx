"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3, ExternalLink, RefreshCw, Video, CheckCircle2 } from "lucide-react";

type Selection = {
  id: string;
  competitor_id: string;
  youtube_channel_id: string;
  channel_title: string;
  channel_url: string | null;
  video_id: string;
  video_title: string;
  video_url: string;
  thumbnail_url: string | null;
  selected_at: string;
  platform?: "youtube"|"instagram";
  social_video_id?: string|null;
  isShortlisted?: boolean;
};

type QueueResponse = {
  mode?: string;
  intervalMinutes?: number;
  activeShortlistedChannels?: number;
  selection?: Selection | null;
  nextRefreshAt?: string | null;
  message?: string;
  error?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value)) + " IST";
}

function remainingLabel(value: string | null | undefined, now: number) {
  if (!value) return "Waiting for first cloud rotation";
  const seconds = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes + "m " + String(seconds % 60).padStart(2, "0") + "s";
}

export default function ChannelPreparationPage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [shortlisting,setShortlisting]=useState(false);
  const [notice,setNotice]=useState("");

  const loadSelection = useCallback(async () => {
    try {
      const response = await fetch("/api/research-queue", { cache: "no-store" });
      const result = (await response.json()) as QueueResponse;
      if (!response.ok) throw new Error(result.error || "Could not load Channel Preparation.");
      setData(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Channel Preparation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSelection();
    const poll = window.setInterval(() => {
      setNow(Date.now());
      void loadSelection();
    }, 60_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [loadSelection]);

  async function shortlistSelection(){if(!selection)return;setShortlisting(true);setNotice("");setError("");try{const response=await fetch("/api/research-queue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"shortlist"})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not shortlist video.");setNotice(result.alreadyShortlisted?"This video is already in Video Explorer.":"Added to Video Explorer shortlist.");await loadSelection();}catch(e){setError(e instanceof Error?e.message:"Could not shortlist video.");}finally{setShortlisting(false);}}
  const selection = data?.selection ?? null;

  return (
    <main className="min-h-screen bg-[#090d14] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-7 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#111925] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-500/50 hover:text-white">
          <ArrowLeft size={16} /> Dashboard
        </Link>

        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-cyan-400">AIWithBh@i Studio</div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Channel Preparation Mode</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Cloud-selected videos from your active, qualified shortlist. No research notes or analysis are collected.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[.07] px-3 py-2 text-xs text-emerald-300">
            <Clock3 size={15} /> Cloud rotation · Every 10 minutes
          </div>
        </div>

        {error && <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        {notice && <div className="mb-5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}

        <section className="rounded-2xl border border-slate-800 bg-[#111925] p-5 md:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Current selection</h2>
              <p className="mt-1 text-xs text-slate-500">
                {data?.activeShortlistedChannels ?? "—"} saved shortlist videos
              </p>
            </div>
            <button onClick={() => void loadSelection()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-white/[.04] disabled:opacity-50">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh status
            </button>
          </div>

          {selection ? (
            <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(260px,.8fr)]">
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#090d14]">
                {selection.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selection.thumbnail_url} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-slate-600"><Video size={42} /></div>
                )}
              </div>
              <div className="flex flex-col">
                <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-cyan-400">Random shortlisted video</div>
                <h3 className="mt-2 text-lg font-semibold leading-7">{selection.video_title}</h3>
                <p className="mt-2 text-sm text-slate-400">{selection.channel_title}</p>
                <p className="mt-4 text-xs text-slate-500">Selected: {formatDate(selection.selected_at)}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <a href={selection.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
                    Open video manually <ExternalLink size={15} />
                  </a>
                  <button onClick={()=>void shortlistSelection()} disabled={shortlisting||selection.isShortlisted} className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 px-4 py-2.5 text-sm font-semibold text-cyan-200 disabled:opacity-50">{shortlisting?<RefreshCw size={14} className="animate-spin"/>:selection.isShortlisted?<CheckCircle2 size={14}/>:<Video size={14}/>} {selection.isShortlisted?"Shortlisted":"Shortlist video"}</button>
                  {selection.channel_url && (
                    <a href={selection.channel_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[.04]">
                      Open channel <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-700 px-5 py-12 text-center">
              <Video size={30} className="mx-auto text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-300">{loading ? "Loading current selection..." : "No selection available yet"}</p>
              <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-slate-500">
                {data?.message || "The cloud scheduler will select a video when it next runs. At least one active qualified channel with a valid saved sample video is required."}
              </p>
            </div>
          )}
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-[#111925] p-5">
            <div className="text-xs text-slate-500">Next scheduled rotation</div>
            <div className="mt-2 text-xl font-semibold tabular-nums">{remainingLabel(data?.nextRefreshAt, now)}</div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">The cloud scheduler runs independently of this page and your computer.</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#111925] p-5">
            <div className="text-xs text-slate-500">Automation boundaries</div>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-400">
              <li>• Randomly selects stored shortlist videos only</li>
              <li>• Does not call YouTube search or consume YouTube API quota</li>
              <li>• Does not play videos or create views, likes, subscriptions, or comments</li>
              <li>• You decide whether to open the selected link</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
