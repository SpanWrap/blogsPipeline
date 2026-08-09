import type { ContentBrief, ResearchSource } from "@/models";

export type ResearchDiscovery = {
  url: string;
  title?: string;
  snippet?: string;
  relevanceScore?: number;
};

export interface ResearchProvider {
  readonly name: string;
  discover(brief: ContentBrief): Promise<ResearchDiscovery[]>;
}

export type { ResearchSource };
