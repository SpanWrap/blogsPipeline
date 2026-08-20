import type { AffiliateConfig, AffiliateMapping } from "./affiliate-links";
import { injectAffiliateLinks, loadAffiliateConfig } from "./affiliate-links";

export type ScoredAffiliate = AffiliateMapping & { relevance: number };

function scoreMapping(content: string, topic: string, mapping: AffiliateMapping): number {
  const hay = `${content}\n${topic}`.toLowerCase();
  const names = [mapping.name, ...(mapping.aliases ?? [])];
  let hits = 0;
  for (const name of names) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    hits += (hay.match(re) ?? []).length;
  }
  if (hits === 0) return 0;
  return Math.min(1, 0.35 + hits * 0.2);
}

/** Only inject affiliates that are relevant to the article topic/body. */
export function injectRelevantAffiliateLinks(
  content: string,
  topic: string,
  config?: AffiliateConfig,
  minRelevance = 0.35,
) {
  const cfg = config ?? loadAffiliateConfig();
  const scored: ScoredAffiliate[] = cfg.links
    .map((link) => ({ ...link, relevance: scoreMapping(content, topic, link) }))
    .filter((l) => l.relevance >= minRelevance)
    .sort((a, b) => b.relevance - a.relevance);

  const filtered: AffiliateConfig = {
    ...cfg,
    links: scored,
    maxTotalLinks: Math.min(cfg.maxTotalLinks ?? 6, 6),
  };
  const result = injectAffiliateLinks(content, filtered);
  return {
    ...result,
    scored,
  };
}
