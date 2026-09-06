import type { ContentBriefInput } from "../../models";
import type { ResearchDiscovery, ResearchProvider } from "./types";
import { topicFromBlogUrl } from "../../utils/url";

/**
 * Uses provided reference URLs as primary discoveries.
 */
export class DirectURLProvider implements ResearchProvider {
  readonly name = "direct-url";

  async discover(brief: ContentBriefInput): Promise<ResearchDiscovery[]> {
    return (brief.referenceUrls ?? []).map((url, index) => ({
      url,
      title: topicFromBlogUrl(url) || `Reference ${index + 1}`,
      snippet: `Primary source for: ${brief.topic}`,
      relevanceScore: 0.99,
    }));
  }
}
