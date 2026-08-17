import type { TrendSignal } from "../../models";
import type { TrendDiscoveryContext, TrendProvider } from "./types";
import { looksLikeAiTopic } from "../../clients/shared";
import { requestJson, requestText } from "../../clients/http";

function tagText(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"));
  if (cdata?.[1]) return decodeXml(cdata[1]);
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return decodeXml(plain?.[1] ?? "");
}

function attr(block: string, tag: string, name: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*\\s${name}=["']([^"']+)["'][^>]*/?>`, "i"));
  return decodeXml(match?.[1] ?? "");
}

export function decodeXml(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export type ParsedFeedItem = {
  title: string;
  url: string;
  description: string;
  publishedAt?: string;
  author?: string;
};

export function parseRssOrAtom(xml: string): ParsedFeedItem[] {
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  if (entryBlocks.length) {
    return entryBlocks
      .map((block) => {
        const link = attr(block, "link", "href") || tagText(block, "id");
        const abs = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
        return {
          title: tagText(block, "title"),
          url: (abs?.[1] || link).trim(),
          description: tagText(block, "summary") || tagText(block, "content"),
          publishedAt: tagText(block, "published") || tagText(block, "updated"),
          author: tagText(block, "name"),
        };
      })
      .filter((item) => item.title && item.url.startsWith("http"));
  }

  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return itemBlocks
    .map((block) => {
      const guid = tagText(block, "guid");
      const link = tagText(block, "link") || (guid.startsWith("http") ? guid : "");
      return {
        title: tagText(block, "title"),
        url: link,
        description: tagText(block, "description") || tagText(block, "content:encoded"),
        publishedAt: tagText(block, "pubDate") || tagText(block, "dc:date"),
        author: tagText(block, "dc:creator") || tagText(block, "author"),
      };
    })
    .filter((item) => item.title && item.url.startsWith("http"));
}

function recencyScore(iso?: string): number {
  if (!iso) return 40;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 40;
  const hours = Math.max(0, (Date.now() - t) / 36e5);
  return Math.max(8, Math.round(1200 - hours * 4));
}

function toSignal(
  item: ParsedFeedItem,
  platform: string,
  community: string,
  now: string,
  score?: number,
): TrendSignal {
  return {
    platform,
    title: item.title.slice(0, 220),
    url: item.url,
    score: score ?? recencyScore(item.publishedAt),
    comments: 0,
    author: item.author,
    community,
    description: (item.description || item.title).slice(0, 280),
    imageUrl: null,
    capturedAt: now,
  };
}

/** Latest cs.AI / cs.LG / cs.CL papers via the official arXiv Atom API. */
export class ArxivTrendProvider implements TrendProvider {
  readonly name = "arxiv";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    const limit = Math.min(ctx.limit ?? 8, 15);
    const url =
      "https://export.arxiv.org/api/query?search_query=" +
      encodeURIComponent("cat:cs.AI OR cat:cs.LG OR cat:cs.CL") +
      `&sortBy=submittedDate&sortOrder=descending&max_results=${limit}`;
    const xml = await requestText(url, {
      timeoutMs: ctx.timeoutMs,
      userAgent: ctx.userAgent,
      accept: "application/atom+xml,application/xml,text/xml",
    });
    const now = new Date().toISOString();
    return parseRssOrAtom(xml)
      .slice(0, limit)
      .map((item) => toSignal(item, "arxiv", "arXiv cs.AI/LG/CL", now));
  }
}

/** Hugging Face daily papers (community-curated, public JSON). */
export class HuggingFacePapersProvider implements TrendProvider {
  readonly name = "huggingface";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    const limit = Math.min(ctx.limit ?? 8, 15);
    const data = await requestJson<unknown>("https://huggingface.co/api/daily_papers", {
      timeoutMs: ctx.timeoutMs,
      userAgent: ctx.userAgent,
    });
    const rows = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { papers?: unknown }).papers)
        ? (data as { papers: unknown[] }).papers
        : [];
    const now = new Date().toISOString();
    const items: TrendSignal[] = [];
    for (const row of rows) {
      const rec = (row ?? {}) as Record<string, unknown>;
      const paper = (rec.paper && typeof rec.paper === "object" ? rec.paper : rec) as Record<
        string,
        unknown
      >;
      const id = String(paper.id ?? rec.paperId ?? "").trim();
      const title = String(paper.title ?? rec.title ?? "").trim();
      if (!title) continue;
      const url = id
        ? `https://huggingface.co/papers/${encodeURIComponent(id)}`
        : typeof rec.url === "string"
          ? rec.url
          : "";
      if (!url.startsWith("http")) continue;
      const summary = String(paper.summary ?? rec.summary ?? title).replace(/\s+/g, " ").trim();
      items.push({
        platform: "huggingface",
        title: title.slice(0, 220),
        url,
        score: Number(paper.upvotes ?? rec.upvotes ?? 0) || recencyScore(String(rec.publishedAt ?? "")),
        comments: 0,
        community: "Hugging Face papers",
        description: summary.slice(0, 280),
        imageUrl: null,
        capturedAt: now,
      });
    }
    return items.slice(0, limit);
  }
}

/** Lobsters tagged AI/ML (public JSON). */
export class LobstersTrendProvider implements TrendProvider {
  readonly name = "lobsters";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    const limit = Math.min(ctx.limit ?? 8, 15);
    const tags = ["ai", "ml"];
    const now = new Date().toISOString();
    const batches = await Promise.all(
      tags.map(async (tag) => {
        const rows = await requestJson<
          Array<{
            title?: string;
            url?: string;
            short_id_url?: string;
            score?: number;
            comment_count?: number;
            description?: string;
            submitter_user?: string | { username?: string };
            tags?: string[];
            created_at?: string;
          }>
        >(`https://lobste.rs/t/${tag}.json`, {
          timeoutMs: ctx.timeoutMs,
          userAgent: ctx.userAgent,
        });
        return rows ?? [];
      }),
    );
    const seen = new Set<string>();
    const items: TrendSignal[] = [];
    for (const row of batches.flat()) {
      const url = row.url || row.short_id_url;
      const title = row.title?.trim();
      if (!title || !url || !url.startsWith("http") || seen.has(url)) continue;
      seen.add(url);
      const author =
        typeof row.submitter_user === "string"
          ? row.submitter_user
          : row.submitter_user?.username;
      items.push({
        platform: "lobsters",
        title,
        url,
        score: row.score ?? 0,
        comments: row.comment_count ?? 0,
        author,
        community: (row.tags ?? []).slice(0, 4).join(", ") || "lobste.rs",
        description: (row.description || title).slice(0, 280),
        imageUrl: null,
        capturedAt: now,
      });
    }
    return items.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

const NEWS_FEEDS: Array<{ community: string; url: string; requireAi: boolean }> = [
  {
    community: "TechCrunch",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    requireAi: false,
  },
  {
    community: "The Verge",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    requireAi: false,
  },
  {
    community: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    requireAi: true,
  },
  {
    community: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    requireAi: true,
  },
  {
    community: "IEEE Spectrum",
    url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
    requireAi: false,
  },
];

/** AI/ML coverage from established tech publications (RSS/Atom). */
export class NewsRssTrendProvider implements TrendProvider {
  readonly name = "news";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    const limit = Math.min(ctx.limit ?? 8, 12);
    const now = new Date().toISOString();
    const results = await Promise.all(
      NEWS_FEEDS.map(async (feed) => {
        try {
          const xml = await requestText(feed.url, {
            timeoutMs: ctx.timeoutMs,
            userAgent: ctx.userAgent,
            accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
            retry: false,
          });
          return parseRssOrAtom(xml)
            .filter((item) => (feed.requireAi ? looksLikeAiTopic(`${item.title} ${item.description}`) : true))
            .slice(0, 6)
            .map((item) => toSignal(item, "news", feed.community, now));
        } catch {
          return [] as TrendSignal[];
        }
      }),
    );
    const seen = new Set<string>();
    const merged: TrendSignal[] = [];
    for (const item of results.flat().sort((a, b) => b.score - a.score)) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
    }
    return merged.slice(0, limit);
  }
}
