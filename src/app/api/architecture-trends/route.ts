import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateResearchJson } from "@/lib/ai/research";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const sources = [
  { id: "walmart", name: "Walmart Global Tech", url: "https://tech.walmart.com/" },
  { id: "uber", name: "Uber Engineering", url: "https://www.uber.com/blog/engineering/" },
  { id: "netflix", name: "Netflix TechBlog", url: "https://netflixtechblog.com/" },
  { id: "stripe", name: "Stripe Engineering", url: "https://stripe.com/blog/engineering" },
  { id: "capitalone", name: "Capital One Tech", url: "https://www.capitalone.com/tech/" },
  { id: "googlehealth", name: "Google Cloud Healthcare", url: "https://cloud.google.com/solutions/healthcare" },
  { id: "microsofthealth", name: "Microsoft Cloud for Healthcare", url: "https://www.microsoft.com/en-us/industry/health" },
  { id: "aws", name: "AWS Machine Learning Blog", url: "https://aws.amazon.com/blogs/machine-learning/" },
  { id: "azure", name: "Microsoft Architecture Center", url: "https://learn.microsoft.com/en-us/azure/architecture/" },
];
const trendSchema = {
  type: "object",
  properties: {
    trends: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" }, industry: { type: "string" },
          companyExamples: { type: "array", items: { type: "object", properties: { company: { type: "string" }, evidenceLevel: { type: "string" }, whyRelevant: { type: "string" } }, required: ["company", "evidenceLevel", "whyRelevant"] } },
          businessProblem: { type: "string" }, pattern: { type: "string" },
          architectureFlow: { type: "array", items: { type: "string" } },
          designConsiderations: { type: "array", items: { type: "string" } },
          tradeoffs: { type: "array", items: { type: "string" } },
          sourceRefs: { type: "array", items: { type: "string" } },
          sourceVideoIds: { type: "array", items: { type: "string" } },
          confidenceScore: { type: "number" }, evidenceNote: { type: "string" },
        },
        required: ["title", "industry", "companyExamples", "businessProblem", "pattern", "architectureFlow", "designConsiderations", "tradeoffs", "sourceRefs", "sourceVideoIds", "confidenceScore", "evidenceNote"],
      },
    },
  },
  required: ["trends"],
};
const system = "You are a principal AI solution architect researching real-world AI architecture patterns for AIWithBh@i, a technical education channel for software engineers. Cover retail, healthcare, airlines and travel, banking, finance, logistics, manufacturing, telecom and media. Produce exactly 5 specific, technical trends spanning recommendation/ranking, forecasting, fraud/risk, document intelligence, clinical workflow support, disruption prediction, personalization, multimodal inspection, real-time decisioning and AI copilots. Keep every field concise: architectureFlow 4-6 short steps; designConsiderations 3-4 short points; tradeoffs 2-3 short points; companyExamples maximum 2. Explain data flow, security, reliability and human oversight without long prose. Supplied company URLs are research portals, not proof of deployment. Label claims documented_source only if directly supported; otherwise inferred_from_public_material or reference_design. Never invent URLs, metrics, deployments or IDs. sourceRefs and sourceVideoIds must be chosen only from supplied items. Return exactly 5 trends. Keep the complete response compact and well below 6000 output tokens. Return only the requested JSON object and keep all strings valid JSON.";
export async function GET() {
  const s = await createSupabaseServerClient();
  if (!s) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await s.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data, error } = await s.from("architecture_trends").select("*").eq("owner_id", user.id).order("updated_at", { ascending: false }).limit(40);
  if (error) return NextResponse.json({ error: "Could not load architecture trends.", details: error.message }, { status: 500 });
  return NextResponse.json({ trends: data ?? [] });
}
export async function POST() {
  const s = await createSupabaseServerClient();
  if (!s) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await s.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data: channels, error: channelError } = await s.from("competitors").select("id,youtube_channel_id,channel_title,channel_url").eq("owner_id", user.id).eq("is_active", true).eq("ai_production_status", "qualified").limit(30);
  if (channelError) return NextResponse.json({ error: "Could not load shortlisted channels.", details: channelError.message }, { status: 500 });
  const ids = (channels ?? []).map(x => x.id);
  const { data: rows, error: videoError } = ids.length
    ? await s.from("videos").select("youtube_video_id,title,description,published_at,video_url,competitor_id").in("competitor_id", ids).order("published_at", { ascending: false }).limit(24)
    : { data: [], error: null };
  if (videoError) return NextResponse.json({ error: "Could not load competitor videos.", details: videoError.message }, { status: 500 });
  const videos = (rows ?? []).map(v => ({ videoId: v.youtube_video_id, title: v.title, description: (v.description ?? "").slice(0, 220), publishedAt: v.published_at, url: v.video_url ?? ("https://www.youtube.com/watch?v=" + v.youtube_video_id), channel: channels?.find(c => c.id === v.competitor_id)?.channel_title ?? "Shortlisted channel" }));
  const { data: prior } = await s.from("architecture_trends").select("title").eq("owner_id", user.id).limit(12);
  try {
    const researchInput = {
      industries: ["Retail", "Healthcare", "Airlines", "Banking", "Finance", "Logistics", "Manufacturing", "Telecom", "Media"],
      sources, shortlistedChannels: (channels ?? []).slice(0, 30).map(x => ({ channel: x.channel_title, url: x.channel_url })),
      competitorVideos: videos.slice(0, 24).map(v => ({ videoId: v.videoId, title: v.title.slice(0, 160), description: v.description, channel: v.channel, url: v.url })),
      avoidRepeating: (prior ?? []).map(x => x.title).slice(0, 12),
    };
    const result = await generateResearchJson(system, JSON.stringify(researchInput), { preferredProvider: "gemini", allowFallback: false, responseSchema: trendSchema });
    const raw = result.data as { trends?: Array<Record<string, unknown>> };
    const validSources = new Map(sources.map(x => [x.id, x]));
    const validVideos = new Set(videos.map(x => x.videoId));
    const trends = (Array.isArray(raw.trends) ? raw.trends : []).slice(0, 12).map(item => {
      const title = String(item.title ?? "AI architecture trend").slice(0, 180);
      const key = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150);
      const refs = Array.isArray(item.sourceRefs) ? item.sourceRefs.filter((x): x is string => typeof x === "string" && validSources.has(x)) : [];
      const vids = Array.isArray(item.sourceVideoIds) ? item.sourceVideoIds.filter((x): x is string => typeof x === "string" && validVideos.has(x)) : [];
      const links = [...refs.map(id => validSources.get(id)!), ...videos.filter(v => vids.includes(v.videoId)).map(v => ({ name: v.channel + ": " + v.title, url: v.url, type: "shortlisted_video" }))];
      return {
        owner_id: user.id, trend_key: key, title, industry: String(item.industry ?? "Cross-industry"),
        company_examples: Array.isArray(item.companyExamples) ? item.companyExamples.slice(0, 8) : [],
        business_problem: String(item.businessProblem ?? ""), pattern: String(item.pattern ?? ""),
        architecture_flow: Array.isArray(item.architectureFlow) ? item.architectureFlow.slice(0, 10) : [],
        design_considerations: Array.isArray(item.designConsiderations) ? item.designConsiderations.slice(0, 10) : [],
        tradeoffs: Array.isArray(item.tradeoffs) ? item.tradeoffs.slice(0, 10) : [],
        source_links: links, source_video_ids: vids,
        confidence_score: Math.max(0, Math.min(100, Number(item.confidenceScore) || 0)),
        evidence_note: String(item.evidenceNote ?? "Verify company-specific deployment claims before publishing."),
        generated_by: result.provider, updated_at: new Date().toISOString(),
      };
    }).filter(x => x.title && x.trend_key);
    if (!trends.length) return NextResponse.json({ error: "AI did not return usable architecture trends." }, { status: 502 });
    const { data, error } = await s.from("architecture_trends").upsert(trends, { onConflict: "owner_id,trend_key" }).select("*");
    if (error) return NextResponse.json({ error: "Could not save architecture trends.", details: error.message, code: error.code, hint: error.hint, action: "Run supabase/migrations/20261123_architecture_trends_repair.sql in the Supabase SQL Editor, then retry." }, { status: 500 });
    return NextResponse.json({ trends: data ?? [], generated: trends.length, provider: result.provider, fallbackUsed: result.fallbackUsed, shortlistedChannels: channels?.length ?? 0, referenceVideosAvailable: videos.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Trend generation failed." }, { status: 502 });
  }
}
