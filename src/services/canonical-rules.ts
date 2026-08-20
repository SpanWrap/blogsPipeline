import { appConfig } from "../config";
import type { PublishTarget } from "../models";

export type CanonicalPlan = {
  primary: PublishTarget;
  targets: PublishTarget[];
  canonicalUrl: string | null;
  notes: string[];
};

/** Prefer Spanwrap as canonical live; others as secondary drafts when configured. */
export function planCrossPost(
  targets: PublishTarget[],
  slug: string,
): CanonicalPlan {
  const unique = [...new Set(targets.length ? targets : (["spanwrap"] as PublishTarget[]))];
  const primary: PublishTarget = unique.includes("spanwrap") ? "spanwrap" : unique[0]!;
  const base =
    primary === "spanwrap"
      ? appConfig.social.blogBaseUrl
      : primary === "medium"
        ? appConfig.publishing.medium.canonicalBase
        : primary === "devto"
          ? appConfig.publishing.devto.canonicalBase
          : primary === "hashnode"
            ? appConfig.publishing.hashnode.canonicalBase
            : appConfig.social.blogBaseUrl;
  const canonicalUrl = base ? `${base.replace(/\/$/, "")}/${slug}` : null;
  const notes = [
    `${primary} is the canonical destination.`,
    unique.length > 1
      ? `Secondary targets (${unique.filter((t) => t !== primary).join(", ")}) should use the canonical URL when the publisher supports it.`
      : "Single-target publish.",
  ];
  return { primary, targets: unique, canonicalUrl, notes };
}
