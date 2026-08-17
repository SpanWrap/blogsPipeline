import type { TrendSignal } from "../../models";
import type { GitHubSourceMode } from "../../clients/github";

export type TrendDiscoveryContext = {
  limit?: number;
  subreddits?: string[];
  userAgent: string;
  timeoutMs: number;
  githubToken?: string;
  xBearerToken?: string;
  githubTopics?: string[];
  githubDays?: number;
  githubLanguage?: string;
  githubSource?: GitHubSourceMode;
  redditClientId?: string;
  redditClientSecret?: string;
  hnQuery?: string;
};

export interface TrendProvider {
  readonly name: string;
  discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]>;
}
