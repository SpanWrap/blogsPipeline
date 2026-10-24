import { appConfig } from "../../config";
import { ContentBriefSchema, type ContentBrief, type ContentBriefInput, type ResearchSource } from "../../models";
import {
  createResearchProvider,
  DirectURLProvider,
  type ResearchDiscovery,
  type ResearchProvider,
} from "../../providers/research";
import { fetchAndExtract } from "../../services/extraction";
import { logger } from "../../services/logger";
import { isNoReaderAudience } from "../../services/reader-constants";
import { createId } from "../../utils/idempotency";
import { normalizeUrl, sourceNameFromUrl } from "../../utils/url";

function scoreRelevance(brief: ContentBrief, d: ResearchDiscovery, content: string): number {
  const base = d.relevanceScore ?? 0.5;
  const hay = `${d.title ?? ""} ${d.snippet ?? ""} ${content}`.toLowerCase();
  const terms = [brief.topic, ...brief.keywords].map((t) => t.toLowerCase()).filter(Boolean);
  const hits = terms.filter((t) => hay.includes(t)).length;
  const boost = terms.length ? hits / terms.length : 0;
  return Math.min(1, Number((base * 0.7 + boost * 0.3).toFixed(3)));
}

function dedupeDiscoveries(items: ResearchDiscovery[]): ResearchDiscovery[] {
  const seen = new Set<string>();
  const out: ResearchDiscovery[] = [];
  for (const item of items) {
    try {
      const key = normalizeUrl(item.url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...item, url: key });
    } catch {
      // skip invalid
    }
  }
  return out;
}

export type ResearchStageOptions = {
  researchProvider?: ResearchProvider;
  /** When true, skip live fetch and synthesize content from discovery metadata (tests). */
  offlineExtract?: boolean;
};

export async function researchStage(
  briefInput: ContentBriefInput,
  options: ResearchStageOptions = {},
): Promise<{ sources: ResearchSource[]; providerName: string }> {
  const brief = ContentBriefSchema.parse(briefInput);
  const primary = options.researchProvider ?? createResearchProvider();
  const direct = new DirectURLProvider();

  const discovered = dedupeDiscoveries([
    ...(await direct.discover(brief)),
    ...(await primary.discover(brief)),
  ]).slice(0, appConfig.maxSources);

  logger.info("Research discoveries collected", {
    count: discovered.length,
    provider: primary.name,
  });

  const sources: ResearchSource[] = [];
  const concurrency = Math.max(1, appConfig.maxFetchConcurrency);
  const referenceKeys = new Set(
    (brief.referenceUrls ?? []).map((u) => {
      try {
        return normalizeUrl(u);
      } catch {
        return u;
      }
    }),
  );

  for (let i = 0; i < discovered.length; i += concurrency) {
    const batch = discovered.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (item) => {
        const id = createId("source");
        const isReference = (() => {
          try {
            return referenceKeys.has(normalizeUrl(item.url));
          } catch {
            return false;
          }
        })();
        if (options.offlineExtract || primary.name.includes("mock")) {
          const synthetic = [
            item.title ?? brief.topic,
            item.snippet ?? "",
            isNoReaderAudience(brief.targetAudience)
              ? `This source discusses ${brief.topic}.`
              : `This source discusses ${brief.topic} for ${brief.targetAudience}.`,
            brief.keywords.map((k) => `Keyword context: ${k}.`).join(" "),
          ]
            .filter(Boolean)
            .join("\n\n");
          return {
            id,
            url: item.url,
            title: item.title ?? brief.topic,
            sourceName: sourceNameFromUrl(item.url),
            content: synthetic,
            publishedAt: null,
            relevanceScore: isReference ? 0.99 : scoreRelevance(brief, item, synthetic),
          } satisfies ResearchSource;
        }

        try {
          const page = await fetchAndExtract(item.url);
          const scored = scoreRelevance(brief, item, page.content);
          return {
            id,
            url: page.url,
            title: page.title || item.title || brief.topic,
            sourceName: page.sourceName,
            content: page.content,
            publishedAt: page.publishedAt,
            relevanceScore: isReference ? Math.max(0.99, scored) : scored,
          } satisfies ResearchSource;
        } catch (error) {
          logger.warn("Source extraction failed", {
            url: item.url,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            id,
            url: item.url,
            title: item.title ?? item.url,
            sourceName: sourceNameFromUrl(item.url),
            content: item.snippet ?? "",
            publishedAt: null,
            relevanceScore: isReference ? 0.9 : (item.relevanceScore ?? 0.3),
            fetchError: error instanceof Error ? error.message : String(error),
          } satisfies ResearchSource;
        }
      }),
    );
    sources.push(...results);
  }

  // Prefer successful, high-relevance, non-empty sources (reference URLs first)
  const ranked = sources
    .filter((s) => s.content.trim().length > 0)
    .sort((a, b) => {
      const aRef = referenceKeys.has(normalizeUrl(a.url)) ? 1 : 0;
      const bRef = referenceKeys.has(normalizeUrl(b.url)) ? 1 : 0;
      if (aRef !== bRef) return bRef - aRef;
      return b.relevanceScore - a.relevanceScore;
    });

  // Second-pass dedupe by normalized URL
  const final: ResearchSource[] = [];
  const seen = new Set<string>();
  for (const s of ranked) {
    const key = normalizeUrl(s.url);
    if (seen.has(key)) continue;
    seen.add(key);
    final.push(s);
  }

  if (final.length === 0) {
    throw new Error("Research produced no usable sources");
  }

  return { sources: final, providerName: primary.name };
}
