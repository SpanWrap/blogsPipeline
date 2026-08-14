import type { ContentBrief } from "../../models";
import type { ResearchDiscovery, ResearchProvider } from "./types";

/**
 * Offline research provider for tests and zero-config local runs.
 */
export class MockResearchProvider implements ResearchProvider {
  readonly name = "mock-research";

  async discover(brief: ContentBrief): Promise<ResearchDiscovery[]> {
    const keyword = brief.keywords[0] ?? brief.topic;
    const refs = (brief.referenceUrls ?? []).map((url, i) => ({
      url,
      title: `Reference ${i + 1}`,
      snippet: brief.topic,
      relevanceScore: 0.95,
    }));

    return [
      ...refs,
      {
        url: "https://example.com/ai-agents-support-foundations",
        title: `${keyword}: foundations`,
        snippet: `Overview of ${brief.topic} for ${brief.targetAudience}.`,
        relevanceScore: 0.9,
      },
      {
        url: "https://example.com/support-automation-tradeoffs",
        title: "Support automation trade-offs",
        snippet: "Where automation helps and where human judgment is required.",
        relevanceScore: 0.85,
      },
      {
        url: "https://example.com/agent-eval-playbook",
        title: "Agent evaluation playbook",
        snippet: "How to measure resolution quality and escalation health.",
        relevanceScore: 0.82,
      },
    ];
  }
}
