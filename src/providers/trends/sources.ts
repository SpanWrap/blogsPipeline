import type { TrendSignal } from "../../models";
import type { TrendDiscoveryContext, TrendProvider } from "./types";
import { getTrendingRepos } from "../../clients/github";
import { getTopPosts } from "../../clients/reddit";

export {
  parseGitHubTrendingHtml,
  parseCompactCount,
  looksLikeAiTopic,
} from "../../clients/github";
export { parseRedditListingHtml, redditTopUrls } from "../../clients/reddit";

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

function decodeHtmlUrl(url?: string | null): string | null {
  if (!url) return null;
  const cleaned = url.replace(/&amp;/g, "&").trim();
  if (!cleaned.startsWith("http")) return null;
  if (["self", "default", "nsfw", "spoiler"].includes(cleaned)) return null;
  return cleaned;
}

/**
 * Hacker News front page / popular stories via official Algolia HN API.
 * https://hn.algolia.com/api
 */
export class HackerNewsTrendProvider implements TrendProvider {
  readonly name = "hackernews";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    const limit = Math.min(ctx.limit ?? 20, 30);
    const endpoint = ctx.hnQuery
      ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(ctx.hnQuery)}&tags=story&hitsPerPage=${limit}`
      : `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`;
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
    }>(endpoint, ctx);

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
        description: h.title!.trim(),
        imageUrl: "https://news.ycombinator.com/y18.svg",
        capturedAt: now,
      }));
  }
}

/** Official Search API (new repos created in the date window) as fallback. */
export class GitHubTrendProvider implements TrendProvider {
  readonly name = "github";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    return getTrendingRepos({
      token: ctx.githubToken,
      userAgent: ctx.userAgent,
      timeoutMs: ctx.timeoutMs,
      topics: ctx.githubTopics,
      days: ctx.githubDays,
      language: ctx.githubLanguage,
      source: ctx.githubSource,
      limit: ctx.limit,
    });
  }
}

/** Reddit /top via OAuth when configured, else public JSON/HTML. */
export class RedditTrendProvider implements TrendProvider {
  readonly name = "reddit";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    return getTopPosts({
      userAgent: ctx.userAgent,
      timeoutMs: ctx.timeoutMs,
      subreddits: ctx.subreddits,
      limit: ctx.limit,
      clientId: ctx.redditClientId,
      clientSecret: ctx.redditClientSecret,
    });
  }
}

/**
 * X (Twitter) recent posts via official API v2 — requires X_BEARER_TOKEN.
 * Does not scrape x.com.
 */
export class XTrendProvider implements TrendProvider {
  readonly name = "x";

  async discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]> {
    if (!ctx.xBearerToken) {
      return [];
    }
    const limit = Math.min(Math.max(ctx.limit ?? 10, 10), 20);
    const query =
      '(AI OR "machine learning" OR LLM OR "generative AI" OR ChatGPT OR OpenAI) lang:en -is:retweet -is:reply';
    const params = new URLSearchParams({
      query,
      max_results: String(limit),
      "tweet.fields": "created_at,public_metrics,text,attachments,author_id",
      expansions: "attachments.media_keys,author_id",
      "media.fields": "url,preview_image_url,type",
      "user.fields": "name,username,profile_image_url",
    });
    const data = await fetchJson<{
      data?: Array<{
        id?: string;
        text?: string;
        author_id?: string;
        public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number };
        attachments?: { media_keys?: string[] };
      }>;
      includes?: {
        media?: Array<{
          media_key?: string;
          type?: string;
          url?: string;
          preview_image_url?: string;
        }>;
        users?: Array<{
          id?: string;
          name?: string;
          username?: string;
          profile_image_url?: string;
        }>;
      };
    }>(`https://api.twitter.com/2/tweets/search/recent?${params.toString()}`, ctx, {
      Authorization: `Bearer ${ctx.xBearerToken}`,
    });

    const mediaByKey = new Map((data.includes?.media ?? []).map((m) => [m.media_key ?? "", m]));
    const userById = new Map((data.includes?.users ?? []).map((u) => [u.id ?? "", u]));
    const now = new Date().toISOString();

    return (data.data ?? [])
      .filter((t) => t.id && t.text)
      .map((t) => {
        const user = userById.get(t.author_id ?? "");
        const mediaKey = t.attachments?.media_keys?.[0];
        const media = mediaKey ? mediaByKey.get(mediaKey) : undefined;
        const imageUrl =
          decodeHtmlUrl(media?.url) ??
          decodeHtmlUrl(media?.preview_image_url) ??
          decodeHtmlUrl(user?.profile_image_url?.replace("_normal", "_bigger")) ??
          null;
        const text = t.text!.replace(/\s+/g, " ").trim();
        const handle = user?.username ? `@${user.username}` : "x";
        return {
          platform: "x",
          title: text.slice(0, 140),
          url: `https://x.com/${user?.username ?? "i"}/status/${t.id}`,
          score:
            (t.public_metrics?.like_count ?? 0) + (t.public_metrics?.retweet_count ?? 0) * 2,
          comments: t.public_metrics?.reply_count ?? 0,
          author: handle,
          community: "x/ai",
          description: text.slice(0, 280),
          imageUrl,
          capturedAt: now,
        };
      });
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
        description?: string;
        cover_image?: string | null;
        social_image?: string | null;
        public_reactions_count?: number;
        comments_count?: number;
        user?: { name?: string; profile_image?: string };
        tag_list?: string[];
      }>
    >(`https://dev.to/api/articles?tag=ai&top=7&per_page=${limit}`, ctx);

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
        description: (a.description ?? a.title ?? "").trim().slice(0, 280),
        imageUrl:
          decodeHtmlUrl(a.cover_image) ??
          decodeHtmlUrl(a.social_image) ??
          decodeHtmlUrl(a.user?.profile_image) ??
          null,
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
        description: "Mock discussion of AI agents in B2B support.",
        imageUrl: null,
        capturedAt: now,
      },
      {
        platform: "mock",
        title: "Founders debate observability for agent workflows",
        url: "https://example.com/mock/agent-observability",
        score: 640,
        comments: 88,
        community: "mock/engineering",
        description: "Mock thread on observability for agent workflows.",
        imageUrl: null,
        capturedAt: now,
      },
      {
        platform: "mock",
        title: "Secure multi-tenant SaaS patterns that still work in 2026",
        url: "https://example.com/mock/saas-multitenant",
        score: 510,
        comments: 62,
        community: "mock/saas",
        description: "Mock thread on multi-tenant SaaS patterns.",
        imageUrl: null,
        capturedAt: now,
      },
    ];
  }
}
