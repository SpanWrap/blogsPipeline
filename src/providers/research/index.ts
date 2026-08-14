import { appConfig } from "../../config";
import type { ResearchProvider } from "./types";
import { MockResearchProvider } from "./mock";
import { SerperResearchProvider, TavilyResearchProvider } from "./web-search";

export function createResearchProvider(
  override?: "auto" | "serper" | "tavily" | "mock",
): ResearchProvider {
  const mode = override ?? appConfig.research.provider;
  if (mode === "mock") return new MockResearchProvider();
  if (mode === "serper") return new SerperResearchProvider();
  if (mode === "tavily") return new TavilyResearchProvider();
  if (appConfig.research.serperApiKey) return new SerperResearchProvider();
  if (appConfig.research.tavilyApiKey) return new TavilyResearchProvider();
  return new MockResearchProvider();
}

export type { ResearchProvider, ResearchDiscovery } from "./types";
export { DirectURLProvider } from "./direct-url";
export { MockResearchProvider } from "./mock";
export { SerperResearchProvider, TavilyResearchProvider } from "./web-search";
