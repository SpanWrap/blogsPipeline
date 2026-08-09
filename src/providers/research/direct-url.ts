import type { ContentBrief } from "@/models";
import type { ResearchDiscovery, ResearchProvider } from "./types";

/**
 * Uses provided reference URLs as primary discoveries.
 */
export class DirectURLProvider implements ResearchProvider {
  readonly name = "direct-url";

  async discover(brief: ContentBrief): Promise<ResearchDiscovery[]> {
    return (brief.referenceUrls ?? []).map((url, index) => ({
      url,
      title: `Reference ${index + 1}`,
      snippet: brief.topic,
      relevanceScore: 0.95,
    }));
  }
}
