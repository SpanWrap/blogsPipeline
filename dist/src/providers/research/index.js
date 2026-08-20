import { appConfig } from "../../config";
import { MockResearchProvider } from "./mock";
import { SerperResearchProvider, TavilyResearchProvider } from "./web-search";
export function createResearchProvider(override) {
    const mode = override ?? appConfig.research.provider;
    if (mode === "mock")
        return new MockResearchProvider();
    if (mode === "serper")
        return new SerperResearchProvider();
    if (mode === "tavily")
        return new TavilyResearchProvider();
    if (appConfig.research.serperApiKey)
        return new SerperResearchProvider();
    if (appConfig.research.tavilyApiKey)
        return new TavilyResearchProvider();
    return new MockResearchProvider();
}
export { DirectURLProvider } from "./direct-url";
export { MockResearchProvider } from "./mock";
export { SerperResearchProvider, TavilyResearchProvider } from "./web-search";
