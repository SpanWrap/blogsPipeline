import type { PublishTarget, TopicRecommendation, ContentBriefInput } from "../models";
import type { LLMProvider } from "../providers/llm";
import { discoverTopicRecommendations } from "./topic-discovery";
import { logger } from "./logger";

/**
 * A single topic pick assigned to a specific platform with a tailored angle.
 */
export interface AutopilotTopicPick {
  /** The original topic recommendation that was selected. */
  recommendation: TopicRecommendation;
  /** The blogging platform this topic should be published to. */
  targetPlatform: PublishTarget;
  /** Catchy title angle crafted for the target platform audience. */
  titleAngle: string;
  /** SEO keywords extracted by the LLM. */
  keywords: string[];
  /** Content brief ready for pipeline creation. */
  brief: ContentBriefInput;
  /** Rank within this cycle (1 = highest priority). */
  rank: number;
}

/** Platform-specific content strategy for tailoring drafts. */
const PLATFORM_STRATEGY: Record<
  PublishTarget,
  { tone: string; contentType: string; audience: string; style: string }
> = {
  spanwrap: {
    tone: "authoritative and comprehensive",
    contentType: "seo-optimized guide",
    audience: "developers and tech enthusiasts searching for in-depth guides",
    style: "long-form SEO articles with practical examples and code snippets",
  },
  medium: {
    tone: "engaging and conversational",
    contentType: "thought leadership",
    audience: "tech professionals and curious generalists on Medium",
    style: "personal insight pieces with storytelling, opinion, and clear takeaways",
  },
  devto: {
    tone: "practical and tutorial-focused",
    contentType: "tutorial",
    audience: "software developers learning new tools and techniques on Dev.to",
    style: "hands-on tutorials with step-by-step code, real examples, and developer tips",
  },
  hashnode: {
    tone: "deep-technical and analytical",
    contentType: "technical deep dive",
    audience: "senior engineers and architects reading Hashnode for technical depth",
    style: "architecture breakdowns, benchmarks, and technical analysis with diagrams",
  },
  wordpress: {
    tone: "professional and educational",
    contentType: "comprehensive guide",
    audience: "business-savvy technologists and decision-makers",
    style: "well-structured guides with sections, comparisons, and actionable recommendations",
  },
  substack: {
    tone: "analytical and newsletter-friendly",
    contentType: "weekly analysis",
    audience: "newsletter subscribers who want curated AI/tech insight and opinion",
    style: "newsletter-style analysis with personal commentary, curated links, and predictions",
  },
};

export type TopicSelectorOptions = {
  platforms: PublishTarget[];
  postsPerPlatform: number;
  recentTopics: string[];
  llm: LLMProvider;
  offline?: boolean;
  /** Reader profile summary. Overrides the hardcoded platform audience. */
  audience?: string;
};

/**
 * Discover trending topics and use the LLM to select the best ones,
 * assigning each to a specific platform with a tailored angle.
 */
export async function selectAutopilotTopics(
  options: TopicSelectorOptions,
): Promise<AutopilotTopicPick[]> {
  const { platforms, postsPerPlatform, recentTopics, llm, offline, audience } = options;
  const totalNeeded = platforms.length * postsPerPlatform;

  // 1. Discover trending topics (fetch more than needed to give LLM room to pick)
  const fetchLimit = Math.max(totalNeeded * 3, 30);
  const recommendations = await discoverTopicRecommendations({
    limit: fetchLimit,
    offline,
  });

  if (recommendations.length === 0) {
    logger.warn("Autopilot: no trending topics discovered");
    return [];
  }

  logger.info("Autopilot: discovered trending topics", {
    count: recommendations.length,
    topHeat: recommendations[0]?.heatScore,
  });

  // 2. Pre-filter: remove topics too similar to recently published ones
  const recentNormalized = recentTopics.map((t) => normalizeForDedup(t));
  const candidates = recommendations.filter((rec) => {
    const norm = normalizeForDedup(rec.topic);
    return !recentNormalized.some((recent) => topicSimilarity(norm, recent) > 0.6);
  });

  if (candidates.length === 0) {
    logger.warn("Autopilot: all topics filtered by dedup — falling back to raw recommendations");
    // Fall back to unfiltered list rather than returning nothing
    candidates.push(...recommendations.slice(0, totalNeeded));
  }

  logger.info("Autopilot: candidates after dedup", {
    before: recommendations.length,
    after: candidates.length,
    recentTopics: recentTopics.length,
  });

  // 3. LLM-powered selection and platform assignment
  const picks = await llmSelectTopics(
    candidates.slice(0, 40), // cap to avoid huge prompts
    platforms,
    postsPerPlatform,
    llm,
    audience,
  );

  return picks;
}

/** Use the LLM to select the best topics and assign them to platforms. */
function briefFor(
  platform: PublishTarget,
  topic: string,
  keywords: string[],
  referenceUrls: string[],
  audience?: string,
): ContentBriefInput {
  const strategy = PLATFORM_STRATEGY[platform];
  const forSpanwrap = platform === "spanwrap";
  return {
    topic,
    targetAudience: audience?.trim() || strategy.audience,
    tone: forSpanwrap ? "technical but easy to understand" : strategy.tone,
    contentType: forSpanwrap ? "technical guide" : strategy.contentType,
    keywords,
    referenceUrls,
  };
}

async function llmSelectTopics(
  candidates: TopicRecommendation[],
  platforms: PublishTarget[],
  postsPerPlatform: number,
  llm: LLMProvider,
  audience?: string,
): Promise<AutopilotTopicPick[]> {
  const totalNeeded = platforms.length * postsPerPlatform;
  const candidateList = candidates
    .map((c, i) => `${i + 1}. [heat=${c.heatScore}] ${c.topic} — ${c.whyItMatters}`)
    .join("\n");

  const platformDescriptions = platforms
    .map((p) => {
      const s = PLATFORM_STRATEGY[p];
      return `- ${p}: ${s.style} (audience: ${s.audience})`;
    })
    .join("\n");

  const prompt = `You are a tech blog content strategist maximizing views and engagement.

## Trending Topics (ranked by heat score)
${candidateList}

## Target Platforms (${postsPerPlatform} unique posts each)
${platformDescriptions}
${
  audience?.trim()
    ? `\n## Reader\n${audience.trim()}\nWrite a technical, practical article for this reader. Do not write a short social post.`
    : ""
}

## Instructions
Select exactly ${totalNeeded} topics from the list above. Rules:
1. Pick topics that are TRENDING, CATCHY, and would generate MAXIMUM VIEWS when written about
2. Every topic must be about AI, machine learning, or technology
3. Each platform needs exactly ${postsPerPlatform} topic(s) — assign each topic to the best-fit platform
4. NO duplicate topics — each selected topic must be unique
5. Favor topics with higher heat scores, but also consider "blog-worthiness" (can it become an engaging long-form post?)
6. For each pick, craft a catchy, click-worthy title angle tailored to that platform's audience
7. Suggest 3-5 SEO keywords for each

Respond ONLY with a JSON array (no markdown code fences):
[
  {
    "topicIndex": <1-based index from the list>,
    "platform": "<platform name>",
    "titleAngle": "<catchy title>",
    "keywords": ["kw1", "kw2", "kw3"]
  }
]`;

  try {
    const response = await llm.generateText(prompt);
    const text = response.trim();
    // Extract JSON from potential markdown fences
    const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(jsonStr) as Array<{
      topicIndex: number;
      platform: string;
      titleAngle: string;
      keywords: string[];
    }>;

    const picks: AutopilotTopicPick[] = [];
    const usedTopics = new Set<number>();

    for (const item of parsed) {
      if (picks.length >= totalNeeded) break;
      const idx = item.topicIndex - 1;
      if (idx < 0 || idx >= candidates.length) continue;
      if (usedTopics.has(idx)) continue;
      const platform = item.platform as PublishTarget;
      if (!platforms.includes(platform)) continue;

      usedTopics.add(idx);
      const rec = candidates[idx]!;

      picks.push({
        recommendation: rec,
        targetPlatform: platform,
        titleAngle: item.titleAngle || rec.topic,
        keywords: item.keywords?.length ? item.keywords : rec.keywords,
        rank: picks.length + 1,
        brief: briefFor(
          platform,
          item.titleAngle || rec.topic,
          item.keywords?.length ? item.keywords : rec.keywords,
          rec.signals
            .map((s) => s.url)
            .filter((u): u is string => Boolean(u))
            .slice(0, 3),
          audience,
        ),
      });
    }

    logger.info("Autopilot: LLM selected topics", {
      requested: totalNeeded,
      selected: picks.length,
      platforms: [...new Set(picks.map((p) => p.targetPlatform))],
    });

    // If LLM didn't return enough, fill with heuristic fallback
    if (picks.length < totalNeeded) {
      fillWithFallback(picks, candidates, platforms, postsPerPlatform, usedTopics, audience);
    }

    return picks;
  } catch (error) {
    logger.warn("Autopilot: LLM topic selection failed, using heuristic fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return heuristicSelect(candidates, platforms, postsPerPlatform, audience);
  }
}

/** Fallback: round-robin assign top topics to platforms by heat score. */
function heuristicSelect(
  candidates: TopicRecommendation[],
  platforms: PublishTarget[],
  postsPerPlatform: number,
  audience?: string,
): AutopilotTopicPick[] {
  const picks: AutopilotTopicPick[] = [];
  const usedTopics = new Set<number>();
  fillWithFallback(picks, candidates, platforms, postsPerPlatform, usedTopics, audience);
  return picks;
}

function fillWithFallback(
  picks: AutopilotTopicPick[],
  candidates: TopicRecommendation[],
  platforms: PublishTarget[],
  postsPerPlatform: number,
  usedTopics: Set<number>,
  audience?: string,
): void {
  const platformCounts = new Map<string, number>();
  for (const p of picks) {
    platformCounts.set(p.targetPlatform, (platformCounts.get(p.targetPlatform) ?? 0) + 1);
  }

  for (const platform of platforms) {
    const current = platformCounts.get(platform) ?? 0;
    const needed = postsPerPlatform - current;
    if (needed <= 0) continue;

    for (let i = 0; i < candidates.length && (platformCounts.get(platform) ?? 0) < postsPerPlatform; i++) {
      if (usedTopics.has(i)) continue;
      const rec = candidates[i]!;
      usedTopics.add(i);
      platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);

      picks.push({
        recommendation: rec,
        targetPlatform: platform,
        titleAngle: rec.topic,
        keywords: rec.keywords,
        rank: picks.length + 1,
        brief: briefFor(
          platform,
          rec.topic,
          rec.keywords,
          rec.signals
            .map((s) => s.url)
            .filter((u): u is string => Boolean(u))
            .slice(0, 3),
          audience,
        ),
      });
    }
  }
}

// ── Deduplication helpers ──

function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Simple word-overlap Jaccard similarity (0..1). */
function topicSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / (wordsA.size + wordsB.size - intersection);
}
