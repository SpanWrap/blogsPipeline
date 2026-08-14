import type { TrendSignal } from "@/models";
import type { TrendDiscoveryContext, TrendProvider } from "./types";

async function fetchJson<T>(
  url: string,
  ctx: TrendDiscoveryContext,
  headers: Record<string, string> = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": ctx.userAgent,
        Accept: "application/json",
        ...headers,
      },
      redirect: "follow",
    });
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status} for ${url}`) as Error & { status: number };
      err.status = response.status;
      throw err;
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hacker News front page / popular stories via official Algolia HN API.
 * https://hn.algolia.com/api
 */
export class HackerNewsTrendProvider implements TrendProvider {
  readonly name = "hackernews";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    const limit = Math.min(ctx.limit ?? 20, 30);
    const data = await fetchJson<{
      hits?: Array<{
        title?: string;
        url?: string;
        points?: number;
        num_comments?: number;
        author?: string;
        objectID?: string;
        created_at?: string;
      }>;
    }>(
      `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`,
      ctx,
    );

    const now = new Date().toISOString();
    return (data.hits ?? [])
      .filter((h) => h.title && h.title.trim().length > 8)
      .map((h) => ({
        platform: "hackernews",
        title: h.title!.trim(),
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID ?? ""}`,
        score: h.points ?? 0,
        comments: h.num_comments ?? 0,
        author: h.author,
        community: "HN",
        capturedAt: now,
      }));
  }
}

/**
 * Reddit public JSON listings (officially supported for personal/read use).
 * Respects rate limits; uses a descriptive User-Agent. No login/CAPTCHA bypass.
 */
export class RedditTrendProvider implements TrendProvider {
  readonly name = "reddit";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    const subs = (ctx.subreddits?.length ? ctx.subreddits : ["technology"]).slice(0, 6);
    const perSub = Math.max(3, Math.ceil((ctx.limit ?? 15) / Math.max(1, subs.length)));
    const now = new Date().toISOString();
    const signals: TrendSignal[] = [];

    for (const sub of subs) {
      try {
        const data = await fetchJson<{
          data?: {
            children?: Array<{
              data?: {
                title?: string;
                url?: string;
                permalink?: string;
                score?: number;
                num_comments?: number;
                author?: string;
                subreddit?: string;
                stickied?: boolean;
              };
            }>;
          };
        }>(`https://www.reddit.com/r/${encodeURIComponent(sub)}/hot.json?limit=${perSub}`, ctx, {
          Accept: "application/json",
        });

        for (const child of data.data?.children ?? []) {
          const d = child.data;
          if (!d?.title || d.stickied) continue;
          if (d.title.trim().length < 8) continue;
          signals.push({
            platform: "reddit",
            title: d.title.trim(),
            url: d.url?.startsWith("http")
              ? d.url
              : `https://www.reddit.com${d.permalink ?? ""}`,
            score: d.score ?? 0,
            comments: d.num_comments ?? 0,
            author: d.author,
            community: `r/${d.subreddit ?? sub}`,
            capturedAt: now,
          });
        }
        // gentle pacing between subreddit calls
        await new Promise((r) => setTimeout(r, 350));
      } catch {
        // Skip blocked/failed subreddit; other sources still work
      }
    }
    return signals;
  }
}

/** Dev.to public articles feed — developer social publishing. */
export class DevToTrendProvider implements TrendProvider {
  readonly name = "devto";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    const limit = Math.min(ctx.limit ?? 15, 30);
    const data = await fetchJson<
      Array<{
        title?: string;
        url?: string;
        public_reactions_count?: number;
        comments_count?: number;
        user?: { name?: string };
        tag_list?: string[];
      }>
    >(`https://dev.to/api/articles?top=1&per_page=${limit}`, ctx);

    const now = new Date().toISOString();
    return (data ?? [])
      .filter((a) => a.title && a.url)
      .map((a) => ({
        platform: "devto",
        title: a.title!.trim(),
        url: a.url!,
        score: a.public_reactions_count ?? 0,
        comments: a.comments_count ?? 0,
        author: a.user?.name,
        community: (a.tag_list ?? []).slice(0, 3).join(", ") || "dev.to",
        capturedAt: now,
      }));
  }
}

/** Offline deterministic source for tests / no-network. */
export class MockTrendProvider implements TrendProvider {
  readonly name = "mock";

  async discover(_ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    const now = new Date().toISOString();
    return [
      {
        platform: "mock",
        title: "Why AI agents are reshaping B2B customer support",
        url: "https://example.com/mock/ai-agents-support",
        score: 920,
        comments: 140,
        community: "mock/startups",
        capturedAt: now,
      },
      {
        platform: "mock",
        title: "Founders debate observability for agent workflows",
        url: "https://example.com/mock/agent-observability",
        score: 640,
        comments: 88,
        community: "mock/engineering",
        capturedAt: now,
      },
      {
        platform: "mock",
        title: "Secure multi-tenant SaaS patterns that still work in 2026",
        url: "https://example.com/mock/saas-multitenant",
        score: 510,
        comments: 62,
        community: "mock/saas",
        capturedAt: now,
      },
    ];
  }
}
