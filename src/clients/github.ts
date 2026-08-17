import * as cheerio from "cheerio";
import type { TrendSignal } from "../models";
import { requestJson, requestText } from "./http";
import { looksLikeAiTopic, parseCompactCount } from "./shared";

export { looksLikeAiTopic, parseCompactCount } from "./shared";

export type GitHubSourceMode = "search" | "trending" | "both";

export type GitHubClientOptions = {
  token?: string;
  userAgent: string;
  timeoutMs: number;
  topics?: string[];
  days?: number;
  language?: string;
  source?: GitHubSourceMode;
  limit?: number;
};

export type GitHubSearchQuery = {
  q: string;
  sort: "stars" | "forks";
};

export function isoDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Official Search API query approximating "trending":
 * date window (created/pushed) + sort by stars or forks.
 * https://docs.github.com/en/rest/search/search
 */
export function buildGitHubSearchQueries(opts: {
  days?: number;
  language?: string;
  topics?: string[];
  now?: Date;
}): GitHubSearchQuery[] {
  const days = opts.days ?? 7;
  const date = isoDaysAgo(days, opts.now);
  const lang = opts.language ? ` language:${opts.language}` : "";
  const topics = (opts.topics?.length ? opts.topics : ["ai", "machine-learning", "llm"]).slice(0, 6);
  const topicQuery = topics.map((t) => `topic:${t}`).join(" OR ");
  const textQuery = [
    "llm",
    "openai",
    '"machine learning"',
    '"generative ai"',
    "pytorch",
    "chatgpt",
  ].join(" OR ");
  return [
    { q: `(${textQuery})${lang} created:>${date} stars:>0`, sort: "stars" },
    { q: `(${topicQuery})${lang} created:>${date} stars:>0`, sort: "stars" },
  ];
}

function githubRepoSignal(
  fullName: string,
  opts: {
    description?: string;
    stars?: number;
    forks?: number;
    starsToday?: number;
    language?: string;
    author?: string;
    capturedAt: string;
  },
): TrendSignal {
  const desc = (opts.description ?? "").replace(/\s+/g, " ").trim();
  const language = (opts.language ?? "").trim();
  const starsToday = opts.starsToday ?? 0;
  const stars = opts.stars ?? 0;
  const communityParts = [
    language,
    stars > 0 ? `${stars.toLocaleString("en-US")} stars` : "",
    starsToday > 0 ? `${starsToday.toLocaleString("en-US")} stars today` : "",
  ].filter(Boolean);
  return {
    platform: "github",
    title: fullName,
    url: `https://github.com/${fullName}`,
    // Prefer stars gained today so evergreens (TensorFlow, Transformers) don't dominate.
    score: starsToday > 0 ? starsToday : stars,
    comments: opts.forks ?? 0,
    author: opts.author ?? fullName.split("/")[0],
    community: communityParts.join(" · ") || "github",
    description: desc || `GitHub repository ${fullName}.`,
    imageUrl: `https://opengraph.githubassets.com/1/${fullName}`,
    capturedAt: opts.capturedAt,
  };
}

/** Parse https://github.com/trending HTML (stars today). */
export function parseGitHubTrendingHtml(html: string, capturedAt: string): TrendSignal[] {
  const $ = cheerio.load(html);
  const signals: TrendSignal[] = [];
  $("article.Box-row").each((_, el) => {
    const $el = $(el);
    const href = ($el.find("h2 a").attr("href") ?? "").trim();
    const fullName = href.replace(/^\/+/, "").split("/").slice(0, 2).join("/");
    if (!fullName.includes("/")) return;
    signals.push(
      githubRepoSignal(fullName, {
        description: $el.find("p").first().text(),
        language: $el.find('[itemprop="programmingLanguage"]').first().text(),
        stars: parseCompactCount($el.find('a[href$="/stargazers"]').first().text()),
        forks: parseCompactCount($el.find('a[href$="/forks"]').first().text()),
        starsToday: parseCompactCount($el.find(".float-sm-right").last().text()),
        capturedAt,
      }),
    );
  });
  return signals;
}

export function rankGitHubSignals(items: TrendSignal[], limit: number): TrendSignal[] {
  const seen = new Set<string>();
  const unique: TrendSignal[] = [];
  for (const item of items) {
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  const ai: TrendSignal[] = [];
  const rest: TrendSignal[] = [];
  for (const item of unique) {
    const haystack = `${item.title} ${item.description} ${item.community ?? ""}`;
    if (looksLikeAiTopic(haystack)) ai.push(item);
    else rest.push(item);
  }
  const byHeat = (a: TrendSignal, b: TrendSignal) =>
    b.score - a.score || b.comments - a.comments;
  ai.sort(byHeat);
  rest.sort(byHeat);
  if (ai.length >= Math.min(3, limit)) return ai.slice(0, limit);
  return [...ai, ...rest].slice(0, limit);
}

type SearchRepo = {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  language?: string | null;
  owner?: { login?: string };
  topics?: string[];
};

function searchHeaders(opts: GitHubClientOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return headers;
}

async function searchRepositories(opts: GitHubClientOptions, capturedAt: string): Promise<TrendSignal[]> {
  const limit = Math.min(opts.limit ?? 10, 25);
  const queries = buildGitHubSearchQueries({
    days: opts.days,
    language: opts.language,
    topics: opts.topics,
  });
  const collected: TrendSignal[] = [];
  const runQuery = async ({ q, sort }: { q: string; sort: "stars" | "forks" }) => {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&order=desc&per_page=${limit}`;
    const data = await requestJson<{ items?: SearchRepo[] }>(url, {
      headers: searchHeaders(opts),
      userAgent: opts.userAgent,
      timeoutMs: opts.timeoutMs,
    });
    for (const repo of data.items ?? []) {
      if (!repo.full_name || !repo.html_url) continue;
      collected.push(
        githubRepoSignal(repo.full_name, {
          description: repo.description ?? "",
          stars: repo.stargazers_count ?? 0,
          forks: repo.forks_count ?? 0,
          language: repo.language ?? (repo.topics ?? []).slice(0, 3).join(", "),
          author: repo.owner?.login,
          capturedAt,
        }),
      );
    }
  };
  for (const query of queries) {
    await runQuery(query);
  }
  return rankGitHubSignals(collected, limit);
}

async function scrapeTrendingPages(opts: GitHubClientOptions, capturedAt: string): Promise<TrendSignal[]> {
  const limit = Math.min(opts.limit ?? 10, 25);
  const pages = ["https://github.com/trending?since=daily"];
  const parsed: TrendSignal[] = [];
  const results = await Promise.allSettled(
    pages.map((page) =>
      requestText(page, {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        timeoutMs: opts.timeoutMs,
        retry: false,
      }),
    ),
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      parsed.push(...parseGitHubTrendingHtml(result.value, capturedAt));
    }
  }
  return rankGitHubSignals(parsed, limit);
}

/**
 * github.com/trending (stars today) first. Search API is only a fallback for
 * newly created repos — never all-time most-starred.
 */
export async function getTrendingRepos(opts: GitHubClientOptions): Promise<TrendSignal[]> {
  const source = opts.source ?? "trending";
  const limit = Math.min(opts.limit ?? 10, 25);
  const now = new Date().toISOString();

  let fromTrending: TrendSignal[] = [];
  if (source !== "search") {
    try {
      fromTrending = await scrapeTrendingPages(opts, now);
    } catch {
      fromTrending = [];
    }
  }
  if (fromTrending.length) return fromTrending.slice(0, limit);

  let searchError: unknown;
  let fromSearch: TrendSignal[] = [];
  try {
    fromSearch = await searchRepositories(opts, now);
  } catch (error) {
    searchError = error;
  }
  if (fromSearch.length) return fromSearch.slice(0, limit);
  if (searchError) throw searchError;
  return [];
}
