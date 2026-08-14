import { appConfig } from "@/config";
import type { TrendProvider } from "./types";
import {
  DevToTrendProvider,
  HackerNewsTrendProvider,
  MockTrendProvider,
  RedditTrendProvider,
} from "./sources";

export type { TrendProvider, TrendDiscoveryContext } from "./types";
export {
  DevToTrendProvider,
  HackerNewsTrendProvider,
  MockTrendProvider,
  RedditTrendProvider,
} from "./sources";

export function createTrendProviders(
  names: string[] = appConfig.trends.sources,
): TrendProvider[] {
  const map: Record<string, () => TrendProvider> = {
    hackernews: () => new HackerNewsTrendProvider(),
    hn: () => new HackerNewsTrendProvider(),
    reddit: () => new RedditTrendProvider(),
    devto: () => new DevToTrendProvider(),
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
