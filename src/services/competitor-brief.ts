import type { ResearchAnalysis, ResearchSource } from "../models";

export type CompetitorBrief = {
  summary: string;
  anglesToOwn: string[];
  anglesToAvoid: string[];
  competingViewpoints: string[];
  sourceHints: Array<{ title: string; url: string }>;
};

export function buildCompetitorBrief(
  analysis: ResearchAnalysis | null | undefined,
  sources: ResearchSource[],
  topic: string,
): CompetitorBrief {
  const viewpoints = analysis?.competingViewpoints ?? [];
  const args = analysis?.keyArguments ?? [];
  const topSources = [...sources]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5)
    .map((s) => ({ title: s.title, url: s.url }));

  return {
    summary:
      analysis?.summary ||
      `Angle brief for “${topic}”: differentiate with operator-ready takeaways, not generic definitions.`,
    anglesToOwn: args.slice(0, 5).length
      ? args.slice(0, 5)
      : [
          `Practical playbook for ${topic}`,
          "Trade-offs and failure modes",
          "Metrics that prove it worked",
        ],
    anglesToAvoid: [
      "Generic 'what is X' definitions without new evidence",
      "Uncited statistics",
      "Vendor hype without counterpoints",
      ...viewpoints.slice(0, 2).map((v) => `Echoing without critique: ${v}`),
    ],
    competingViewpoints: viewpoints,
    sourceHints: topSources,
  };
}
