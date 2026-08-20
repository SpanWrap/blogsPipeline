import { TechDigestSchema, TechDigestItemSchema } from "../models";
import { appConfig } from "../config";
import { logger } from "./logger";
import { DevToTrendProvider, GitHubTrendProvider, HackerNewsTrendProvider, MockTrendProvider, RedditTrendProvider, XTrendProvider, } from "../providers/trends";
import { ArxivTrendProvider, HuggingFacePapersProvider, LobstersTrendProvider, NewsRssTrendProvider, } from "../providers/trends/feeds";
import { TtlCache } from "../utils/ttl-cache";
const digestCache = new TtlCache(appConfig.trends.cacheTtlMinutes * 60_000);
export function resetDigestCache() {
    digestCache.clear();
}
function trendContext(limit) {
    return {
        limit,
        subreddits: appConfig.trends.digestRedditSubreddits,
        userAgent: appConfig.userAgent,
        timeoutMs: appConfig.requestTimeoutMs,
        githubToken: appConfig.trends.githubToken,
        xBearerToken: appConfig.trends.xBearerToken,
        githubTopics: appConfig.trends.githubTopics,
        githubDays: appConfig.trends.githubDays,
        githubLanguage: appConfig.trends.githubLanguage,
        githubSource: appConfig.trends.githubSource,
        redditClientId: appConfig.trends.redditClientId,
        redditClientSecret: appConfig.trends.redditClientSecret,
    };
}
function toItem(signal, platform) {
    if (!signal.url || !signal.title)
        return null;
    try {
        return TechDigestItemSchema.parse({
            platform,
            title: signal.title,
            description: signal.description || signal.title,
            url: signal.url,
            imageUrl: signal.imageUrl ?? null,
            score: signal.score ?? 0,
            comments: signal.comments ?? 0,
            author: signal.author,
            community: signal.community,
            capturedAt: signal.capturedAt,
        });
    }
    catch {
        return null;
    }
}
function mockDigest() {
    const now = new Date().toISOString();
    return TechDigestSchema.parse({
        generatedAt: now,
        theme: "AI/ML technology",
        github: [
            {
                platform: "github",
                title: "example/weekly-ai-agent",
                description: "Mock trending AI agent framework topping GitHub stars and forks.",
                url: "https://github.com/example/weekly-ai-agent",
                imageUrl: "https://opengraph.githubassets.com/1/example/weekly-ai-agent",
                score: 4200,
                comments: 310,
                author: "example",
                community: "ai, llm",
                capturedAt: now,
            },
        ],
        reddit: [
            {
                platform: "reddit",
                title: "Open-source multimodal model beats last week's baseline",
                description: "Mock r/artificial /top discussion of a new open multimodal release.",
                url: "https://www.reddit.com/r/artificial/top/",
                imageUrl: "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png",
                score: 1800,
                comments: 240,
                author: "mockuser",
                community: "r/artificial",
                capturedAt: now,
            },
        ],
        x: [
            {
                platform: "x",
                title: "New paper: smaller LLMs matching frontier tools on agent tasks",
                description: "Mock daily AI thread summarizing a research drop.",
                url: "https://x.com/example/status/1",
                imageUrl: "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png",
                score: 960,
                comments: 88,
                author: "@example",
                community: "x/ai",
                capturedAt: now,
            },
        ],
        more: [
            {
                platform: "arxiv",
                title: "Mock: Scaling laws for tool-using language agents",
                description: "Offline stand-in for a new arXiv cs.AI paper.",
                url: "https://arxiv.org/abs/2601.00001",
                imageUrl: null,
                score: 80,
                comments: 0,
                community: "arXiv cs.AI/LG/CL",
                capturedAt: now,
            },
            {
                platform: "hackernews",
                title: "Show HN: open evaluation suite for multimodal agents",
                description: "Offline stand-in for an HN AI story.",
                url: "https://news.ycombinator.com/item?id=1",
                imageUrl: null,
                score: 410,
                comments: 90,
                community: "HN",
                capturedAt: now,
            },
        ],
        notes: ["Offline mock digest (TRENDS_OFFLINE or --offline)."],
    });
}
async function collect(provider, ctx, platform, limit) {
    try {
        const signals = await provider.discover(ctx);
        const items = signals
            .map((s) => toItem(s, platform))
            .filter((item) => Boolean(item))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        logger.info("Digest provider completed", { provider: provider.name, items: items.length });
        return { items };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Digest provider failed", { provider: provider.name, error: message });
        return { items: [], error: `${provider.name}: ${message}` };
    }
}
/**
 * GitHub trending, Reddit /top, X, plus HN, Dev.to, arXiv, Hugging Face papers,
 * Lobsters, and AI RSS from TechCrunch / The Verge / MIT TR / Ars / IEEE Spectrum.
 */
export async function discoverTechDigest(options = {}) {
    if (options.offline)
        return mockDigest();
    const limit = options.limit ?? appConfig.trends.digestLimit;
    const cacheKey = `digest:${limit}`;
    if (!options.refresh) {
        const cached = digestCache.get(cacheKey);
        if (cached)
            return cached;
    }
    const ctx = trendContext(limit);
    const extraLimit = Math.max(4, Math.min(limit, 8));
    const [github, reddit, x, hn, devto, arxiv, hf, lobsters, news] = await Promise.all([
        collect(new GitHubTrendProvider(), ctx, "github", Math.max(1, Math.min(limit, 10))),
        collect(new RedditTrendProvider(), ctx, "reddit", limit),
        collect(new XTrendProvider(), ctx, "x", limit),
        collect(new HackerNewsTrendProvider(), { ...ctx, limit: extraLimit, hnQuery: 'AI OR LLM OR "machine learning"' }, "hackernews", extraLimit),
        collect(new DevToTrendProvider(), { ...ctx, limit: extraLimit }, "devto", extraLimit),
        collect(new ArxivTrendProvider(), { ...ctx, limit: extraLimit }, "arxiv", extraLimit),
        collect(new HuggingFacePapersProvider(), { ...ctx, limit: extraLimit }, "huggingface", extraLimit),
        collect(new LobstersTrendProvider(), { ...ctx, limit: extraLimit }, "lobsters", extraLimit),
        collect(new NewsRssTrendProvider(), { ...ctx, limit: extraLimit }, "news", extraLimit),
    ]);
    const notes = [];
    for (const result of [github, reddit, x, hn, devto, arxiv, hf, lobsters, news]) {
        if (result.error)
            notes.push(result.error);
    }
    if (!appConfig.trends.xBearerToken) {
        notes.push("X posts skipped — set X_BEARER_TOKEN (Twitter API v2 bearer) to enable.");
    }
    if (github.items.length === 0 && !github.error) {
        notes.push("No GitHub repos matched daily trending.");
    }
    if (github.error &&
        /403|429|rate limit/i.test(github.error) &&
        !appConfig.trends.githubToken) {
        notes.push("Set GITHUB_TOKEN — unauthenticated Search is 60 req/hr (Search also 30 req/min).");
    }
    if (reddit.items.length === 0 && !reddit.error && !appConfig.trends.redditClientId) {
        notes.push("Reddit /top is limited without REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET.");
    }
    const seen = new Set();
    const more = [];
    for (const item of [...hn.items, ...devto.items, ...arxiv.items, ...hf.items, ...lobsters.items, ...news.items]) {
        if (seen.has(item.url))
            continue;
        seen.add(item.url);
        more.push(item);
    }
    more.sort((a, b) => b.score - a.score);
    const digest = TechDigestSchema.parse({
        generatedAt: new Date().toISOString(),
        theme: "AI/ML technology",
        github: github.items,
        reddit: reddit.items,
        x: x.items,
        more,
        notes,
    });
    digestCache.set(cacheKey, digest);
    return digest;
}
/** Convenience: mock signals still work for existing topic tests. */
export { MockTrendProvider };
