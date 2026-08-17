import * as cheerio from "cheerio";
import type { TrendSignal } from "../models";
import { looksLikeAiTopic, parseCompactCount } from "./shared";
import { requestJson, requestText } from "./http";

export type RedditClientOptions = {
  userAgent: string;
  timeoutMs: number;
  subreddits?: string[];
  limit?: number;
  clientId?: string;
  clientSecret?: string;
  time?: "day" | "week";
};

type RedditPost = {
  title?: string;
  url?: string;
  permalink?: string;
  score?: number;
  num_comments?: number;
  author?: string;
  subreddit?: string;
  stickied?: boolean;
  selftext?: string;
  thumbnail?: string;
  preview?: { images?: Array<{ source?: { url?: string } }> };
  over_18?: boolean;
};

type RedditListingJson = {
  data?: { children?: Array<{ data?: RedditPost }> };
};

type TokenState = { value: string; expiresAt: number };

let cachedToken: TokenState | null = null;

function decodeHtmlUrl(url?: string | null): string | null {
  if (!url) return null;
  const cleaned = url.replace(/&amp;/g, "&").trim();
  if (!cleaned.startsWith("http")) return null;
  if (["self", "default", "nsfw", "spoiler"].includes(cleaned)) return null;
  return cleaned;
}

export function mapRedditChild(d: RedditPost | undefined, sub: string, now: string): TrendSignal | null {
  if (!d?.title || d.stickied || d.over_18) return null;
  if (d.title.trim().length < 8) return null;
  const haystack = `${d.title} ${d.selftext ?? ""} ${d.subreddit ?? sub}`;
  const aiSub =
    /machinelearning|localllama|artificial|openai|chatgpt|languagetechnology|datascience|technology/i.test(
      sub,
    );
  if (!aiSub && !looksLikeAiTopic(haystack)) return null;
  const permalink = d.permalink ? `https://www.reddit.com${d.permalink}` : undefined;
  const preview = decodeHtmlUrl(d.preview?.images?.[0]?.source?.url);
  const thumb = decodeHtmlUrl(d.thumbnail);
  const link = decodeHtmlUrl(d.url);
  const imageUrl =
    preview ??
    (thumb && /\.(jpg|jpeg|png|gif|webp)/i.test(thumb) ? thumb : null) ??
    (link && /\.(jpg|jpeg|png|gif|webp)/i.test(link) ? link : null);
  const description = (d.selftext ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
  return {
    platform: "reddit",
    title: d.title.trim(),
    url: permalink ?? link ?? `https://www.reddit.com/r/${sub}/top/`,
    score: d.score ?? 0,
    comments: d.num_comments ?? 0,
    author: d.author,
    community: `r/${d.subreddit ?? sub}`,
    description: description || d.title.trim(),
    imageUrl,
    capturedAt: now,
  };
}

/** Public /top listings, e.g. https://www.reddit.com/r/artificial/top/ */
export function redditTopUrls(sub: string, limit: number): { json: string[]; html: string[] } {
  const encoded = encodeURIComponent(sub);
  const n = Math.max(1, Math.min(limit, 25));
  return {
    json: [
      `https://www.reddit.com/r/${encoded}/top.json?t=day&limit=${n}&raw_json=1`,
      `https://www.reddit.com/r/${encoded}/top.json?t=week&limit=${n}&raw_json=1`,
      `https://old.reddit.com/r/${encoded}/top.json?t=day&limit=${n}&raw_json=1`,
      `https://old.reddit.com/r/${encoded}/top.json?t=week&limit=${n}&raw_json=1`,
    ],
    html: [
      `https://old.reddit.com/r/${encoded}/top/?t=day`,
      `https://www.reddit.com/r/${encoded}/top/?t=day`,
    ],
  };
}

export function parseRedditListingHtml(html: string, sub: string, capturedAt: string): TrendSignal[] {
  const $ = cheerio.load(html);
  const signals: TrendSignal[] = [];
  $(".thing.link, div.thing").each((_, el) => {
    const $el = $(el);
    if ($el.hasClass("stickied") || $el.attr("data-nsfw") === "true") return;
    const title = (
      $el.find("a.title").first().text() || $el.find("a[data-event-action='title']").first().text()
    ).trim();
    const permalink = ($el.attr("data-permalink") ?? "").trim();
    const mapped = mapRedditChild(
      {
        title,
        permalink,
        author: ($el.attr("data-author") ?? "").trim(),
        subreddit: ($el.attr("data-subreddit") ?? sub).trim(),
        score: parseCompactCount($el.attr("data-score") ?? $el.find(".score.unvoted").first().text()),
        num_comments: parseCompactCount($el.find("a.comments").first().text()),
        stickied: false,
        over_18: false,
        url: permalink ? `https://www.reddit.com${permalink}` : undefined,
      },
      sub,
      capturedAt,
    );
    if (mapped) signals.push(mapped);
  });
  return signals;
}

export function redditOAuthTopUrl(sub: string, limit: number, t: "day" | "week" = "day"): string {
  const n = Math.max(1, Math.min(limit, 25));
  return `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/top?limit=${n}&t=${t}`;
}

async function getAccessToken(opts: RedditClientOptions): Promise<string> {
  if (!opts.clientId || !opts.clientSecret) {
    throw new Error("Reddit OAuth requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET");
  }
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }
  const basic = Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64");
  const data = await requestJson<{ access_token?: string; expires_in?: number }>(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      userAgent: opts.userAgent,
      timeoutMs: opts.timeoutMs,
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
  );
  if (!data.access_token) {
    throw new Error("Reddit OAuth did not return an access_token");
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

export function resetRedditTokenCache(): void {
  cachedToken = null;
}

async function fetchOAuthTop(
  sub: string,
  token: string,
  opts: RedditClientOptions,
  now: string,
): Promise<TrendSignal[]> {
  const t = opts.time ?? "day";
  const perSub = Math.max(3, Math.ceil((opts.limit ?? 15) / Math.max(1, opts.subreddits?.length ?? 1)));
  const data = await requestJson<RedditListingJson>(redditOAuthTopUrl(sub, perSub, t), {
    userAgent: opts.userAgent,
    timeoutMs: opts.timeoutMs,
    headers: { Authorization: `Bearer ${token}` },
  });
  const signals: TrendSignal[] = [];
  for (const child of data.data?.children ?? []) {
    const mapped = mapRedditChild(child.data, sub, now);
    if (mapped) signals.push(mapped);
  }
  if (signals.length === 0 && t === "day") {
    const weekly = await requestJson<RedditListingJson>(redditOAuthTopUrl(sub, perSub, "week"), {
      userAgent: opts.userAgent,
      timeoutMs: opts.timeoutMs,
      headers: { Authorization: `Bearer ${token}` },
    });
    for (const child of weekly.data?.children ?? []) {
      const mapped = mapRedditChild(child.data, sub, now);
      if (mapped) signals.push(mapped);
    }
  }
  return signals;
}

async function fetchPublicTop(sub: string, opts: RedditClientOptions, now: string): Promise<TrendSignal[]> {
  const perSub = Math.max(3, Math.ceil((opts.limit ?? 15) / Math.max(1, opts.subreddits?.length ?? 1)));
  const feeds = redditTopUrls(sub, perSub);
  const errors: string[] = [];
  for (const path of feeds.json) {
    try {
      const data = await requestJson<RedditListingJson>(path, {
        userAgent: opts.userAgent,
        timeoutMs: opts.timeoutMs,
        retry: false,
      });
      const signals: TrendSignal[] = [];
      for (const child of data.data?.children ?? []) {
        const mapped = mapRedditChild(child.data, sub, now);
        if (mapped) signals.push(mapped);
      }
      if (signals.length) return signals;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const path of feeds.html) {
    try {
      const html = await requestText(path, {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        timeoutMs: opts.timeoutMs,
        retry: false,
      });
      const parsed = parseRedditListingHtml(html, sub, now);
      if (parsed.length) return parsed;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length) throw new Error(errors[0]);
  return [];
}

/**
 * Reddit /top via official OAuth (oauth.reddit.com) when credentials are set.
 * Falls back to public /r/{sub}/top.json (often 403 from datacenter IPs).
 */
export async function getTopPosts(opts: RedditClientOptions): Promise<TrendSignal[]> {
  const subs = (opts.subreddits?.length ? opts.subreddits : ["artificial", "technology"]).slice(0, 6);
  const now = new Date().toISOString();
  const signals: TrendSignal[] = [];
  const errors: string[] = [];
  const useOauth = Boolean(opts.clientId && opts.clientSecret);
  const token = useOauth ? await getAccessToken(opts) : null;

  for (const sub of subs) {
    try {
      const batch = token
        ? await fetchOAuthTop(sub, token, opts, now)
        : await fetchPublicTop(sub, opts, now);
      signals.push(...batch);
      await new Promise((r) => setTimeout(r, 250));
    } catch (error) {
      errors.push(`${sub}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (signals.length === 0 && errors.length) {
    const hint = useOauth
      ? "Reddit OAuth /top failed"
      : "Reddit /top blocked (set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET)";
    throw new Error(`${hint} (${errors[0]})`);
  }
  return signals;
}
