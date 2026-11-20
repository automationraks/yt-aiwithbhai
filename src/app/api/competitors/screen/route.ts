import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAIConfiguration } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sample = { title?: string; description?: string; videoUrl?: string | null; thumbnailUrl?: string | null; matchedQuery?: string };
type ImagePart = { inlineData: { mimeType: string; data: string } };

async function fetchRecentChannelSamples(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, channelId: string): Promise<Sample[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured on the server.");
  const { data: reservation, error: quotaError } = await supabase.rpc("reserve_youtube_quota", { p_bucket: "general", p_amount: 2 });
  if (quotaError) throw new Error("YouTube quota tracker is unavailable. Run the latest quota migration.");
  if (!reservation?.allowed) throw new Error("Your tracked YouTube general API quota is exhausted. Try again after the daily reset.");

  const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelUrl.searchParams.set("part", "contentDetails");
  channelUrl.searchParams.set("id", channelId);
  channelUrl.searchParams.set("key", apiKey);
  const channelResponse = await fetch(channelUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const channelPayload = await channelResponse.json().catch(() => ({}));
  if (!channelResponse.ok) throw new Error(channelPayload?.error?.message || "Could not load the channel uploads playlist.");
  const uploadsPlaylist = channelPayload?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) throw new Error("YouTube did not return an uploads playlist for this channel.");

  const playlistUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  playlistUrl.searchParams.set("part", "snippet,contentDetails");
  playlistUrl.searchParams.set("playlistId", uploadsPlaylist);
  playlistUrl.searchParams.set("maxResults", "5");
  playlistUrl.searchParams.set("key", apiKey);
  const playlistResponse = await fetch(playlistUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  type PlaylistItem = {
    contentDetails?: { videoId?: string; videoPublishedAt?: string };
    snippet?: {
      resourceId?: { videoId?: string };
      title?: string;
      description?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
  };
  const playlistPayload: { error?: { message?: string }; items?: PlaylistItem[] } =
    await playlistResponse.json().catch(() => ({}));
  if (!playlistResponse.ok) throw new Error(playlistPayload.error?.message || "Could not load recent channel videos.");
  return (playlistPayload.items ?? []).map((item) => {
    const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
    return {
      videoId,
      title: item.snippet?.title ?? "",
      description: (item.snippet?.description ?? "").slice(0, 1200),
      channelTitle: item.snippet?.channelTitle ?? "",
      publishedAt: item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt ?? null,
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
      matchedQuery: "latest channel uploads",
      videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    };
  }).filter((item: Sample) => Boolean(item.videoUrl));
}


async function getThumbnail(url: string): Promise<ImagePart | null> {
  try {
    const parsed = new URL(url);
    const allowed = ["i.ytimg.com", "yt3.ggpht.com"];
    if (parsed.protocol !== "https:" || !allowed.some((host) => parsed.hostname === host || parsed.hostname.endsWith("." + host))) return null;
    const response = await fetch(parsed, { signal: AbortSignal.timeout(7000), cache: "no-store" });
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 1_500_000) return null;
    return { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } };
  } catch { return null; }
}

const instruction = `You are evaluating a YouTube creator for a channel research database. Target niche: technical education about designing, building, scaling and operating AI-powered software systems for IT professionals.

Prioritize creators who teach AI system design, LLM application architecture, RAG pipelines, vector databases, AI agents and orchestration, model serving/inference, distributed systems, production AI infrastructure, evaluation/observability, reliability, security and real-world architecture case studies.

Do NOT confuse creators who merely discuss AI news, AI tools, generic prompt tips or AI business trends with creators who teach technical architecture and engineering. Assess supplied channel description, sample video titles/descriptions and thumbnails only. Never claim you watched full videos or verified technical correctness from metadata alone.

Return ONLY JSON with this exact structure:
{
 "industrialRelevance": 0,
 "facelessFormatLikelihood": 0,
 "syntheticVisualStyleLikelihood": 0,
 "aiProductionDisclosure": "explicit" | "none_found" | "unclear",
 "narrationEvidence": "explicit_synthetic" | "explicit_human" | "unknown",
 "recommendation": "strong_candidate" | "possible_candidate" | "unlikely_match",
 "evidence": ["short evidence items"],
 "limitations": ["what cannot be verified"]
}

Use industrialRelevance as the legacy numeric field for AI-systems niche relevance (0-100): score relevance to the target technical education niche, not manufacturing. Use facelessFormatLikelihood as technical teaching format suitability and syntheticVisualStyleLikelihood as visual explainer/diagram suitability; neither is a requirement. A strong_candidate requires repeated evidence of substantive AI systems architecture and engineering education aimed at developers/IT professionals. Penalize generic AI news, tool roundups and nontechnical content. Include specific evidence and uncertainty.`;

function parseResult(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const value = JSON.parse(cleaned);
  const score = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const disclosure = ["explicit", "none_found", "unclear"].includes(value.aiProductionDisclosure) ? value.aiProductionDisclosure : "unclear";
  const narration = ["explicit_synthetic", "explicit_human", "unknown"].includes(value.narrationEvidence) ? value.narrationEvidence : "unknown";
  const recommendation = ["strong_candidate", "possible_candidate", "unlikely_match"].includes(value.recommendation) ? value.recommendation : "possible_candidate";
  return {
    industrialRelevance: score(value.industrialRelevance),
    facelessFormatLikelihood: score(value.facelessFormatLikelihood),
    syntheticVisualStyleLikelihood: score(value.syntheticVisualStyleLikelihood),
    aiProductionDisclosure: disclosure,
    narrationEvidence: narration,
    recommendation,
    evidence: Array.isArray(value.evidence) ? value.evidence.filter((x: unknown) => typeof x === "string").slice(0, 8) : [],
    limitations: Array.isArray(value.limitations) ? value.limitations.filter((x: unknown) => typeof x === "string").slice(0, 8) : [],
  };
}

async function runGemini(prompt: string, images: ImagePart[]) {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instruction }] },
      contents: [{ role: "user", parts: [{ text: prompt }, ...images] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini request failed (${response.status}).`);
  const output = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
  if (!output) throw new Error("Gemini returned an empty screening result.");
  return parseResult(output);
}

async function runGroq(prompt: string) {
  const key = process.env.GROQ_API_KEY!;
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature: 0.1, response_format: { type: "json_object" },
      messages: [{ role: "system", content: instruction }, { role: "user", content: prompt + "\nNo images are available in this fallback mode. Be conservative about visual-style scores." }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Groq request failed (${response.status}).`);
  const output = payload?.choices?.[0]?.message?.content;
  if (!output) throw new Error("Groq returned an empty screening result.");
  return parseResult(output);
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (typeof body.id !== "string" || body.id.length > 80) return NextResponse.json({ error: "A valid competitor id is required." }, { status: 400 });

  const { data: competitor, error } = await supabase.from("competitors")
    .select("id,youtube_channel_id,channel_title,channel_url,description,ai_production_evidence")
    .eq("id", body.id).eq("owner_id", user.id).maybeSingle();
  if (error || !competitor) return NextResponse.json({ error: "Competitor not found." }, { status: 404 });

  const evidence = (competitor.ai_production_evidence && typeof competitor.ai_production_evidence === "object")
    ? competitor.ai_production_evidence as Record<string, unknown> : {};
  let samples = (Array.isArray(evidence.sampleVideos) ? evidence.sampleVideos : []) as Sample[];
  if (!samples.length) {
    try {
      samples = await fetchRecentChannelSamples(supabase, competitor.youtube_channel_id);
      if (!samples.length) return NextResponse.json({ error: "YouTube did not return any recent public videos for this channel. Check whether the channel has public uploads." }, { status: 422 });
      const { error: evidenceSaveError } = await supabase.from("competitors").update({
        ai_production_evidence: { ...evidence, sampleVideos: samples, sampleVideosRefreshedAt: new Date().toISOString(), requiresHumanVerification: true },
      }).eq("id", competitor.id).eq("owner_id", user.id);
      if (evidenceSaveError) return NextResponse.json({ error: "Sample videos were retrieved but could not be saved.", details: evidenceSaveError.message }, { status: 500 });
    } catch (sampleError) {
      const message = sampleError instanceof Error ? sampleError.message : "Could not retrieve sample videos.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const prompt = [
    `Channel: ${competitor.channel_title}`,
    `Channel URL: ${competitor.channel_url ?? "not available"}`,
    `Channel description: ${(competitor.description ?? "").slice(0, 2500)}`,
    "Sample videos:",
    ...samples.slice(0, 5).map((video, index) => `${index + 1}. Title: ${video.title ?? ""}\nDescription: ${(video.description ?? "").slice(0, 600)}\nSearch term: ${video.matchedQuery ?? ""}\nVideo URL: ${video.videoUrl ?? ""}`),
  ].join("\n\n");

  const config = getAIConfiguration();
  if (!config.configured) return NextResponse.json({ error: "Add GEMINI_API_KEY or GROQ_API_KEY to the server environment before AI screening." }, { status: 503 });

  let result: ReturnType<typeof parseResult>;
  let provider = "";
  let imagesUsed = 0;
  let fallbackNote: string | null = null;
  const images: ImagePart[] = [];
  if (config.available.includes("gemini")) {
    for (const sample of samples.slice(0, 3)) {
      if (!sample.thumbnailUrl) continue;
      const image = await getThumbnail(sample.thumbnailUrl);
      if (image) images.push(image);
    }
  }
  imagesUsed = images.length;

  const preferred = config.primary;
  try {
    if (preferred === "gemini" && config.available.includes("gemini")) {
      result = await runGemini(prompt, images); provider = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    } else if (preferred === "groq" && config.available.includes("groq")) {
      result = await runGroq(prompt); provider = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    } else if (config.available.includes("gemini")) {
      result = await runGemini(prompt, images); provider = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    } else {
      result = await runGroq(prompt); provider = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    }
  } catch (primaryError) {
    const fallback = config.primary === "gemini" ? "groq" : "gemini";
    if (!config.available.includes(fallback)) throw primaryError;
    fallbackNote = primaryError instanceof Error ? primaryError.message.slice(0, 300) : "Primary provider failed.";
    if (fallback === "groq") { result = await runGroq(prompt); provider = process.env.GROQ_MODEL || "openai/gpt-oss-120b"; imagesUsed = 0; }
    else { result = await runGemini(prompt, images); provider = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite"; }
  }

  const aiScreening = {
    ...result, provider, screenedAt: new Date().toISOString(), imagesAnalyzed: imagesUsed,
    sampleVideosAnalyzed: Math.min(samples.length, 5),
    status: "advisory_only",
    narrationVerification: result.narrationEvidence === "unknown" ? "Not verified; no audio/transcript was supplied." : "Based on explicit public creator disclosure, not direct audio verification.",
    fallbackNote,
  };
  // Preserve any samples fetched earlier in this same request. The initial
  // evidence object is stale when the channel had no saved samples.
  const latestEvidence = {
    ...evidence,
    sampleVideos: samples,
    sampleVideosRefreshedAt: evidence.sampleVideosRefreshedAt ?? new Date().toISOString(),
    requiresHumanVerification: true,
    aiScreening,
  };
  const { data: updated, error: saveError } = await supabase.from("competitors").update({
    ai_production_evidence: latestEvidence,
  }).eq("id", competitor.id).eq("owner_id", user.id)
    .select("id,ai_production_evidence,ai_production_status").maybeSingle();
  if (saveError || !updated) return NextResponse.json({ error: "AI screening ran, but its result could not be saved.", details: saveError?.message }, { status: 500 });

  return NextResponse.json({ screening: aiScreening, competitor: updated });
}
