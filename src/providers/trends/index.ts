import { appConfig } from "../../config";
import type { TrendProvider } from "./types";
import {
  DevToTrendProvider,
  GitHubTrendProvider,
  HackerNewsTrendProvider,
  MockTrendProvider,
  RedditTrendProvider,
  XTrendProvider,
} from "./sources";
import {
  ArxivTrendProvider,
  HuggingFacePapersProvider,
  LobstersTrendProvider,
  NewsRssTrendProvider,
} from "./feeds";

export type { TrendProvider, TrendDiscoveryContext } from "./types";
export {
  DevToTrendProvider,
  GitHubTrendProvider,
  HackerNewsTrendProvider,
  MockTrendProvider,
  RedditTrendProvider,
  XTrendProvider,
  parseGitHubTrendingHtml,
  parseRedditListingHtml,
  redditTopUrls,
  parseCompactCount,
} from "./sources";
export {
  ArxivTrendProvider,
  HuggingFacePapersProvider,
  LobstersTrendProvider,
  NewsRssTrendProvider,
  parseRssOrAtom,
  decodeXml,
} from "./feeds";

export function createTrendProviders(
  names: string[] = appConfig.trends.sources,
): TrendProvider[] {
  const map: Record<string, () => TrendProvider> = {
    hackernews: () => new HackerNewsTrendProvider(),
    hn: () => new HackerNewsTrendProvider(),
    github: () => new GitHubTrendProvider(),
    reddit: () => new RedditTrendProvider(),
    x: () => new XTrendProvider(),
    twitter: () => new XTrendProvider(),
    devto: () => new DevToTrendProvider(),
    arxiv: () => new ArxivTrendProvider(),
    huggingface: () => new HuggingFacePapersProvider(),
    hf: () => new HuggingFacePapersProvider(),
    lobsters: () => new LobstersTrendProvider(),
    news: () => new NewsRssTrendProvider(),
    mock: () => new MockTrendProvider(),
  };

  const providers: TrendProvider[] = [];
  for (const name of names) {
    const factory = map[name];
    if (factory) providers.push(factory());
  }
  if (providers.length === 0) {
    providers.push(new MockTrendProvider());
  }
  return providers;
}
