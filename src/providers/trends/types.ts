import type { TrendSignal } from "../../models";

export type TrendDiscoveryContext = {
  limit?: number;
  subreddits?: string[];
  userAgent: string;
  timeoutMs: number;
};

export interface TrendProvider {
  readonly name: string;
  discover(ctx: TrendDiscoveryContext): Promise<TrendSignal[]>;
}
