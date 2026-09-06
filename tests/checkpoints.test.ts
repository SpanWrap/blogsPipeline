import { describe, expect, it } from "vitest";
import {
  completeStage,
  hasActiveLease,
  markInterrupted,
  startStage,
  setStatus,
} from "../src/pipeline/state";
import type { PipelineRun } from "../src/models";

function baseRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: "run_test",
    status: "CREATED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    brief: {
      topic: "DNS",
      targetAudience: "devs",
      tone: "clear",
      contentType: "educational",
      keywords: [],
      referenceUrls: [],
    },
    templateId: null,
    templateName: null,
    templateMarkdown: null,
    sources: [],
    analysis: null,
    outline: null,
    article: null,
    quality: null,
    generateImages: false,
    publishTargets: ["spanwrap"],
    publishResult: null,
    publishResults: [],
    stages: [],
    reviewNotes: null,
    error: null,
    failedStage: null,
    errorCode: null,
    retryable: false,
    stylePresetId: null,
    previousArticle: null,
    seoPack: null,
    thumbnailVariants: [],
    repurposePack: null,
    autoAccepted: false,
    articleHistory: [],
    checkpointVersion: 0,
    lastCheckpoint: null,
    checkpoints: [],
    leaseId: null,
    leaseUntil: null,
    autopilotSource: null,
    idempotencyKey: "idem_test",
    ...overrides,
  } as PipelineRun;
}

describe("pipeline checkpoints + interrupt recovery", () => {
  it("versions checkpoints when a stage completes", () => {
    let run = startStage(baseRun(), "generation");
    run = completeStage(run, "generation", { title: "Hello DNS" });
    expect(run.checkpointVersion).toBe(1);
    expect(run.lastCheckpoint).toBe("generation");
    expect(run.checkpoints).toHaveLength(1);
    expect(run.checkpoints[0]?.note).toBe("Hello DNS");
  });

  it("marks interrupted without wiping earlier artifacts", () => {
    let run = setStatus(startStage(baseRun({ article: { title: "t", slug: "t", excerpt: "e", content: "c", tags: [], keywords: [], seoTitle: "t", seoDescription: "d", featuredImage: null, sources: [] } as any }), "quality"), "QUALITY_CHECK");
    run = { ...run, leaseId: "lease_1", leaseUntil: new Date(Date.now() + 60_000).toISOString() };
    expect(hasActiveLease(run)).toBe(true);
    const failed = markInterrupted(run);
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe("INTERRUPTED");
    expect(failed.retryable).toBe(true);
    expect(failed.failedStage).toBe("quality");
    expect(failed.article).toBeTruthy();
    expect(failed.leaseId).toBeNull();
    expect(hasActiveLease(failed)).toBe(false);
  });
});
