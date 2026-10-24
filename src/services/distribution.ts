import {
  DISTRIBUTION_DESTINATIONS,
  type DistributionDestination,
  type DistributionEntry,
  type DistributionStatus,
} from "../models";
import { isLivePublishTarget } from "../pipeline/stages/publishing";

export const DISTRIBUTION_LABELS: Record<DistributionDestination, string> = {
  spanwrap: "Spanwrap",
  medium: "Medium",
  devto: "Dev.to",
  hashnode: "Hashnode",
  wordpress: "WordPress",
  substack: "Substack",
  reddit: "Reddit",
  linkedin: "LinkedIn",
};

/** Sites this app can push to. Substack, Reddit, and LinkedIn are checklist-only. */
const API_DESTINATIONS = ["spanwrap", "medium", "devto", "hashnode", "wordpress"] as const;

export function isDistributionDestination(value: string): value is DistributionDestination {
  return (DISTRIBUTION_DESTINATIONS as readonly string[]).includes(value);
}

export function isPushDestination(value: string): value is (typeof API_DESTINATIONS)[number] {
  return (API_DESTINATIONS as readonly string[]).includes(value);
}

export function distributionBoard(current?: DistributionEntry[] | null): DistributionEntry[] {
  const byId = new Map((current ?? []).map((entry) => [entry.destination, entry]));
  return DISTRIBUTION_DESTINATIONS.map((destination) => {
    const existing = byId.get(destination);
    return {
      destination,
      status: existing?.status ?? "not_sent",
      updatedAt: existing?.updatedAt ?? null,
      message: existing?.message ?? null,
      externalId: existing?.externalId ?? null,
    };
  });
}

export function pushableDestinations(): DistributionDestination[] {
  const ready: DistributionDestination[] = ["spanwrap"];
  for (const destination of ["medium", "devto", "hashnode", "wordpress"] as const) {
    if (isLivePublishTarget(destination)) ready.push(destination);
  }
  return ready;
}

export function mergePublishResults(
  current: DistributionEntry[] | undefined,
  results: Array<{
    target?: string;
    success: boolean;
    statusCode?: number;
    message: string;
    externalId?: string;
  }>,
  now = new Date().toISOString(),
): DistributionEntry[] {
  const board = distributionBoard(current);
  for (const result of results) {
    if (!result.target || !isDistributionDestination(result.target)) continue;
    const entry = board.find((row) => row.destination === result.target);
    if (!entry) continue;
    if (result.success) {
      entry.status = "sent";
      entry.externalId = result.externalId ?? entry.externalId;
      entry.message = result.message;
      entry.updatedAt = now;
    } else if (result.statusCode === 501) {
      entry.message = result.message;
    } else {
      entry.status = "failed";
      entry.message = result.message;
      entry.updatedAt = now;
    }
  }
  return board;
}

export function setDistributionStatus(
  current: DistributionEntry[] | undefined,
  destination: DistributionDestination,
  status: DistributionStatus,
  message: string | null,
  now = new Date().toISOString(),
): DistributionEntry[] {
  const board = distributionBoard(current);
  const entry = board.find((row) => row.destination === destination);
  if (!entry) return board;
  entry.status = status;
  entry.message = message;
  entry.updatedAt = now;
  if (status === "not_sent") entry.externalId = null;
  return board;
}

