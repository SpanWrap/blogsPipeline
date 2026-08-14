import type { PipelineRun, PipelineStatus, StageRecord } from "../models";

export function nowIso(): string {
  return new Date().toISOString();
}

export function startStage(
  run: PipelineRun,
  stage: string,
  extra?: Partial<StageRecord>,
): PipelineRun {
  const record: StageRecord = {
    stage,
    status: "running",
    startedAt: nowIso(),
    endedAt: null,
    durationMs: null,
    retryCount: 0,
    error: null,
    meta: {},
    ...extra,
  };
  const stages = [...run.stages.filter((s) => s.stage !== stage), record];
  return { ...run, stages, updatedAt: nowIso() };
}

export function completeStage(
  run: PipelineRun,
  stage: string,
  meta: Record<string, unknown> = {},
): PipelineRun {
  const stages = run.stages.map((s) => {
    if (s.stage !== stage) return s;
    const endedAt = nowIso();
    const start = s.startedAt ? Date.parse(s.startedAt) : Date.now();
    return {
      ...s,
      status: "completed" as const,
      endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - start),
      meta: { ...s.meta, ...meta },
      error: null,
    };
  });
  return { ...run, stages, updatedAt: nowIso() };
}

export function failStage(run: PipelineRun, stage: string, error: string): PipelineRun {
  const stages = run.stages.map((s) => {
    if (s.stage !== stage) return s;
    const endedAt = nowIso();
    const start = s.startedAt ? Date.parse(s.startedAt) : Date.now();
    return {
      ...s,
      status: "failed" as const,
      endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - start),
      error,
    };
  });
  return {
    ...run,
    stages,
    status: "FAILED" as PipelineStatus,
    error,
    updatedAt: nowIso(),
  };
}

export function setStatus(run: PipelineRun, status: PipelineStatus): PipelineRun {
  return { ...run, status, updatedAt: nowIso(), error: status === "FAILED" ? run.error : null };
}
