import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AI_NEWS_SOURCES } from "@/lib/research/ai-news-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Story = {
  id: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  sourceId: string;
  sourceName: string;
  category: string;
};

function clean(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function value(block: string, tags: string[]) {
  for (const tag of tags) {
    const match = block.match(
      new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"),
    );
    if (match) return clean(match[1]);
  }
  return "";
}

function parse(xml: string, source: (typeof AI_NEWS_SOURCES)[number]): Story[] {
  const blocks =
    xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];

  return blocks.flatMap((block, index): Story[] => {
    const title = value(block, ["title"]);
    const href = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1];
    const link = href || value(block, ["link", "guid", "id"]);
    const summary = value(block, ["description", "summary", "content:encoded", "content"]);
    const rawDate = value(block, ["pubDate", "published", "updated", "dc:date"]);
    const publishedAt =
      rawDate && !Number.isNaN(Date.parse(rawDate))
        ? new Date(rawDate).toISOString()
        : null;

    if (!title || !/^https?:\/\//i.test(link)) return [];

    return [{
      id: source.id + ":" + (publishedAt || index) + ":" + title.slice(0, 28),
      title,
      link,
      summary: summary.slice(0, 700),
      publishedAt,
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
    }];
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const category = req.nextUrl.searchParams.get("category") || "All";
  const days = Math.min(
    30,
    Math.max(1, Number(req.nextUrl.searchParams.get("days") || 14)),
  );
  const chosen = AI_NEWS_SOURCES.filter(
    (source) => category === "All" || source.category === category,
  );

  const results = await Promise.allSettled(
    chosen.map(async (source) => {
      const response = await fetch(source.feedUrl, {
        headers: { "User-Agent": "AIWithBhaiResearch/1.0" },
        signal: AbortSignal.timeout(9000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return parse(await response.text(), source);
    }),
  );

  const stories: Story[] = [];
  const sourceStatus = results.map((result, index) => {
    const source = chosen[index];
    if (result.status === "fulfilled") {
      stories.push(...result.value);
      return {
        id: source.id,
        name: source.name,
        category: source.category,
        status: "ok",
        count: result.value.length,
        homepage: source.homepage,
      };
    }
    return {
      id: source.id,
      name: source.name,
      category: source.category,
      status: "unavailable",
      count: 0,
      homepage: source.homepage,
    };
  });

  const cutoff = Date.now() - days * 86400000;
  const filtered = stories
    .filter((story) => !story.publishedAt || Date.parse(story.publishedAt) >= cutoff)
    .sort(
      (a, b) =>
        (b.publishedAt ? Date.parse(b.publishedAt) : 0) -
        (a.publishedAt ? Date.parse(a.publishedAt) : 0),
    );

  return NextResponse.json({
    stories: filtered.slice(0, 200),
    sources: sourceStatus,
    updatedAt: new Date().toISOString(),
    windowDays: days,
    note: "Live public feeds. Confirm announcements and research papers at their original sources before scripting.",
  });
}
