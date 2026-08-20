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
  if (!analysis) return [];
  const byId = new Map(sources.map((s) => [s.id, s]));

  const fromClaims = (analysis.claims ?? []).map((c: Claim) => {
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
  if (fromClaims.length) return fromClaims;

  // Fallback when the model returned arguments but no structured claims.
  return (analysis.keyArguments ?? []).slice(0, 8).map((arg) => ({
    claim: arg,
    category: "argument",
    confidence: 0.5,
    sources: [],
    grounded: false,
  }));
}

export function unsourcedClaimCount(cards: FactCard[]): number {
  return cards.filter((c) => !c.grounded || c.category === "verification_needed").length;
}
