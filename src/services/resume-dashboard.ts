import type { PipelineRun } from "../models";

export type ResumeBucket = {
  id: string;
  label: string;
  count: number;
  runIds: string[];
};

export type ResumeDashboard = {
  buckets: ResumeBucket[];
  generatedAt: string;
};

export function buildResumeDashboard(runs: PipelineRun[]): ResumeDashboard {
  const buckets: Record<string, ResumeBucket> = {
    failed_retryable: { id: "failed_retryable", label: "Failed (retryable)", count: 0, runIds: [] },
    failed_blocked: { id: "failed_blocked", label: "Failed (needs attention)", count: 0, runIds: [] },
    awaiting_draft_review: {
      id: "awaiting_draft_review",
      label: "Generating / draft pending accept",
      count: 0,
      runIds: [],
    },
    review_required: { id: "review_required", label: "Ready to approve", count: 0, runIds: [] },
    approved: { id: "approved", label: "Approved — ready to publish", count: 0, runIds: [] },
    publish_failed: { id: "publish_failed", label: "Publish failed", count: 0, runIds: [] },
    published: { id: "published", label: "Published", count: 0, runIds: [] },
  };

  for (const run of runs) {
    let key: string | null = null;
    if (run.status === "FAILED" && run.retryable) key = "failed_retryable";
    else if (run.status === "FAILED") key = "failed_blocked";
    else if (run.status === "GENERATING" || (run.status === "OUTLINE_READY" && !run.article))
      key = "awaiting_draft_review";
    else if (run.status === "REVIEW_REQUIRED" || run.status === "DRAFT_READY" || run.status === "QUALITY_CHECK")
      key = "review_required";
    else if (run.status === "APPROVED") key = "approved";
    else if (run.status === "PUBLISH_FAILED") key = "publish_failed";
    else if (run.status === "PUBLISHED") key = "published";
    if (!key) continue;
    buckets[key]!.count += 1;
    buckets[key]!.runIds.push(run.id);
  }

  return {
    buckets: Object.values(buckets).filter((b) => b.count > 0),
    generatedAt: new Date().toISOString(),
  };
}
