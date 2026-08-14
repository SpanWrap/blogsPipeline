import { appConfig } from "../../config";
import type { ContentBrief } from "../../models";
import { isValidHttpUrl } from "../../utils/url";
import type { ResearchDiscovery, ResearchProvider } from "./types";

export class SerperResearchProvider implements ResearchProvider {
  readonly name = "serper";

  constructor(private readonly apiKey = appConfig.research.serperApiKey) {
    if (!this.apiKey) throw new Error("SERPER_API_KEY is required for Serper provider");
  }

  async discover(brief: ContentBrief): Promise<ResearchDiscovery[]> {
    const query = [brief.topic, ...brief.keywords].filter(Boolean).join(" ");
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": this.apiKey!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: appConfig.maxSources }),
    });
    if (!response.ok) {
      const error = new Error(`Serper HTTP ${response.status}`) as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    const data = (await response.json()) as {
      organic?: Array<{ link?: string; title?: string; snippet?: string }>;
    };
    return (data.organic ?? [])
      .filter((r) => r.link && isValidHttpUrl(r.link))
      .map((r, index) => ({
        url: r.link!,
        title: r.title,
        snippet: r.snippet,
        relevanceScore: Math.max(0.5, 0.95 - index * 0.05),
      }));
  }
}

export class TavilyResearchProvider implements ResearchProvider {
  readonly name = "tavily";

  constructor(private readonly apiKey = appConfig.research.tavilyApiKey) {
    if (!this.apiKey) throw new Error("TAVILY_API_KEY is required for Tavily provider");
  }

  async discover(brief: ContentBrief): Promise<ResearchDiscovery[]> {
    const query = [brief.topic, ...brief.keywords].filter(Boolean).join(" ");
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: appConfig.maxSources,
        include_answer: false,
      }),
    });
    if (!response.ok) {
      const error = new Error(`Tavily HTTP ${response.status}`) as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    const data = (await response.json()) as {
      results?: Array<{ url?: string; title?: string; content?: string; score?: number }>;
    };
    return (data.results ?? [])
      .filter((r) => r.url && isValidHttpUrl(r.url))
      .map((r) => ({
        url: r.url!,
        title: r.title,
        snippet: r.content,
        relevanceScore: typeof r.score === "number" ? Math.min(1, Math.max(0, r.score)) : 0.7,
      }));
  }
}
