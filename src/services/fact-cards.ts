import type { Claim, ResearchAnalysis, ResearchSource } from "../models";

export type FactCard = {
  claim: string;
  category: string;
  confidence: number;
  sources: Array<{ id: string; title: string; url: string; sourceName: string }>;
  grounded: boolean;
};

export function buildFactCards(
  analysis: ResearchAnalysis | null | undefined,
  sources: ResearchSource[],
): FactCard[] {
  if (!analysis?.claims?.length) return [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  return analysis.claims.map((c: Claim) => {
    const linked = c.sourceIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((s) => ({
        id: s!.id,
        title: s!.title,
        url: s!.url,
        sourceName: s!.sourceName,
      }));
    return {
      claim: c.claim,
      category: c.category,
      confidence: c.confidence,
      sources: linked,
      grounded: linked.length > 0,
    };
  });
}

export function unsourcedClaimCount(cards: FactCard[]): number {
  return cards.filter((c) => !c.grounded || c.category === "verification_needed").length;
}
