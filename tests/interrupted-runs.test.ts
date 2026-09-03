import { describe, expect, it } from "vitest";
import type { PipelineRun } from "@/models";
import {
  inFlightAgeMs,
  isInFlightRun,
  markInterrupted,
  startStage,
} from "@/pipeline/state";

function baseRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  const now = new Date().toISOString();
  return {
    id: "run_test",
    status: "GENERATING",
    createdAt: now,
    updatedAt: now,
    brief: {
      topic: "WebAssembly interpreters",
      targetAudience: "engineers",
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
    ...overrides,
  } as PipelineRun;
}

describe("interrupted run recovery", () => {
  it("detects GENERATING and running stages as in-flight", () => {
    expect(isInFlightRun(baseRun({ status: "GENERATING" }))).toBe(true);
    expect(isInFlightRun(baseRun({ status: "REVIEW_REQUIRED", stages: [] }))).toBe(false);
    const withRunning = startStage(baseRun({ status: "RESEARCH_COMPLETE" }), "analysis");
    expect(isInFlightRun(withRunning)).toBe(true);
  });

  it("marks interrupted generation as FAILED and retryable", () => {
    const run = startStage(baseRun(), "generation");
    const failed = markInterrupted(run);
    expect(failed.status).toBe("FAILED");
    expect(failed.failedStage).toBe("generation");
    expect(failed.retryable).toBe(true);
    expect(failed.errorCode).toBe("INTERRUPTED");
    expect(failed.stages.find((s) => s.stage === "generation")?.status).toBe("failed");
  });

  it("computes in-flight age from running stage start", () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const run = baseRun({
      stages: [
        {
          stage: "generation",
          status: "running",
          startedAt,
          endedAt: null,
          durationMs: null,
          retryCount: 0,
          error: null,
          meta: {},
        },
      ],
    });
    expect(inFlightAgeMs(run)).toBeGreaterThanOrEqual(55_000);
  });
});
