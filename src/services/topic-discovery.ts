import type { TopicRecommendation, TrendSignal } from "@/models";
import { TopicRecommendationSchema } from "@/models";
import { createTrendProviders, type TrendProvider } from "@/providers/trends";
import { appConfig } from "@/config";
import { createId } from "@/utils/idempotency";
import { logger } from "@/services/logger";

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function heatFromSignals(signals: TrendSignal[]): number {
  let raw = 0;
  for (const s of signals) {
    raw += Math.log10((s.score || 0) + 10) * 18;
    raw += Math.log10((s.comments || 0) + 5) * 10;
    if (s.platform === "hackernews") raw += 8;
    if (s.platform === "reddit") raw += 4;
    if (s.platform === "devto") raw += 3;
  }
  // multi-platform boost
  const platforms = new Set(signals.map((s) => s.platform));
  if (platforms.size > 1) raw += 12;
  return Math.max(1, Math.min(100, Math.round(raw)));
}

function extractKeywords(title: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "is",
    "are",
    "how",
    "why",
    "what",
    "this",
    "that",
    "from",
    "your",
    "you",
    "we",
    "our",
    "as",
    "at",
    "by",
    "be",
    "it",
    "its",
  ]);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  return [...new Set(words)].slice(0, 8);
}

function topicFromCluster(signals: TrendSignal[]): string {
  // Prefer shortest concise HN/reddit title as blog topic seed
  const sorted = [...signals].sort((a, b) => a.title.length - b.title.length);
  const base = sorted[0]?.title ?? "Emerging tech topic";
  // Soft clean clickbait noise
  return base
    .replace(/\s*[|/].*$/, "")
    .replace(/\s+\(comment.*\)$/i, "")
    .trim()
    .slice(0, 140);
}

function blogAngle(topic: string, platforms: string[]): string {
  const where = platforms.join(" + ") || "social discussion";
  return `Explain ${topic} for practitioners who saw it debated on ${where}, with practical takeaways and caveats.`;
}

function whyItMatters(signals: TrendSignal[]): string {
  const totalScore = signals.reduce((n, s) => n + (s.score || 0), 0);
  const totalComments = signals.reduce((n, s) => n + (s.comments || 0), 0);
  const communities = [...new Set(signals.map((s) => s.community).filter(Boolean))].slice(0, 3);
  return `Collective engagement ~${totalScore} points / ${totalComments} comments${
    communities.length ? ` across ${communities.join(", ")}` : ""
  }.`;
}

export type DiscoverTopicsOptions = {
  providers?: TrendProvider[];
  limit?: number;
  subreddits?: string[];
  /** Force mock providers (tests) */
  offline?: boolean;
};

/**
 * Discover and rank blog topic recommendations from public social/dev trend feeds.
 * Uses HTTP JSON APIs only — no CAPTCHA, auth, or anti-bot bypass.
 */
export async function discoverTopicRecommendations(
  options: DiscoverTopicsOptions = {},
): Promise<TopicRecommendation[]> {
  const providers =
    options.providers ??
    (options.offline ? createTrendProviders(["mock"]) : createTrendProviders());

  const ctx = {
    limit: options.limit ?? appConfig.trends.limit,
    subreddits: options.subreddits ?? appConfig.trends.redditSubreddits,
    userAgent: appConfig.userAgent,
    timeoutMs: appConfig.requestTimeoutMs,
  };

  const allSignals: TrendSignal[] = [];
  for (const provider of providers) {
    try {
      const batch = await provider.discover(ctx);
      allSignals.push(...batch);
      logger.info("Trend provider completed", {
        provider: provider.name,
        signals: batch.length,
      });
    } catch (error) {
      logger.warn("Trend provider failed", {
        provider: provider.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Cluster near-duplicate titles
  const clusters = new Map<string, TrendSignal[]>();
  for (const signal of allSignals) {
    const key = normalizeTitle(signal.title)
      .split(" ")
      .slice(0, 8)
      .join(" ");
    if (!key) continue;
    const list = clusters.get(key) ?? [];
    list.push(signal);
    clusters.set(key, list);
  }

  const now = new Date();
  const expires = new Date(now.getTime() + appConfig.trends.cacheTtlMinutes * 60_000);

  const recommendations: TopicRecommendation[] = [];
  for (const signals of clusters.values()) {
    const topic = topicFromCluster(signals);
    if (topic.length < 8) continue;
    const platforms = [...new Set(signals.map((s) => s.platform))];
    const heatScore = heatFromSignals(signals);
    recommendations.push(
      TopicRecommendationSchema.parse({
        id: createId("topic"),
        topic,
        summary: signals[0]?.title ?? topic,
        whyItMatters: whyItMatters(signals),
        blogAngle: blogAngle(topic, platforms),
        keywords: extractKeywords(topic),
        heatScore,
        platforms,
        signals: signals.slice(0, 5),
        discoveredAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      }),
    );
  }

  return recommendations
    .sort((a, b) => b.heatScore - a.heatScore)
    .slice(0, options.limit ?? appConfig.trends.limit);
}
