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
  const version = (run.checkpointVersion ?? 0) + 1;
  const note =
    typeof meta.title === "string"
      ? meta.title
      : typeof meta.score === "number"
        ? `score ${meta.score}`
        : typeof meta.sourcesFound === "number"
          ? `${meta.sourcesFound} sources`
          : undefined;
  const checkpoints = [
    ...(run.checkpoints ?? []),
    { version, stage, at: nowIso(), note },
  ].slice(-40);
  return {
    ...run,
    stages,
    checkpointVersion: version,
    lastCheckpoint: stage,
    checkpoints,
    updatedAt: nowIso(),
    error: null,
    failedStage: null,
    errorCode: null,
    retryable: false,
  };
}

/** True when another worker still holds a non-expired lease on this run. */
export function hasActiveLease(run: PipelineRun, now = Date.now()): boolean {
  if (!run.leaseUntil) return false;
  const until = Date.parse(run.leaseUntil);
  return Number.isFinite(until) && until > now;
}

/**
 * Mark a run that died mid-stage (process restart, aborted request, etc.) as FAILED
 * so the UI can show Retry instead of a permanent GENERATING badge.
 * Preserves research/outline/article so Continue can resume from the failed stage.
 */
export function markInterrupted(
  run: PipelineRun,
  message =
    "Pipeline was interrupted before this stage finished (server restart or aborted request). Safe to retry.",
): PipelineRun {
  const stage = inferInterruptedStage(run);
  let next = run;
  if (!findRunningStage(run) || findRunningStage(run)?.stage !== stage) {
    next = startStage(run, stage);
  }
  const failed = failStage(next, stage, message, {
    errorCode: "INTERRUPTED",
    retryable: true,
  });
  return {
    ...failed,
    leaseId: null,
    leaseUntil: null,
  };
}


export function failStage(
  run: PipelineRun,
  stage: string,
  error: string,
  opts?: { errorCode?: string; retryable?: boolean },
): PipelineRun {
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
    failedStage: stage,
    errorCode: opts?.errorCode ?? classifyErrorCode(error),
    retryable: opts?.retryable ?? isRetryableError(error),
    updatedAt: nowIso(),
  };
}

/** Derive a machine-readable error code from an error message. */
function classifyErrorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("interrupted")) return "INTERRUPTED";
  if (m.includes("timed out") || m.includes("timeout")) return "LLM_TIMEOUT";
  if (m.includes("rate limit") || m.includes("429") || m.includes("tpm")) return "RATE_LIMIT";
  if (m.includes("prompt too large") || m.includes("413")) return "PROMPT_TOO_LARGE";
  if (m.includes("no usable sources")) return "RESEARCH_EMPTY";
  if (m.includes("model") && (m.includes("not found") || m.includes("unavailable"))) return "MODEL_NOT_FOUND";
  if (m.includes("api key")) return "AUTH_ERROR";
  if (m.includes("empty llm response") || m.includes("did not contain valid json")) return "EMPTY_RESPONSE";
  if (/5\d\d/.test(message)) return "SERVER_ERROR";
  return "UNKNOWN";
}

/** Determine if the error is transient and worth retrying. */
function isRetryableError(message: string): boolean {
  const code = classifyErrorCode(message);
  return ["LLM_TIMEOUT", "RATE_LIMIT", "SERVER_ERROR", "EMPTY_RESPONSE", "INTERRUPTED"].includes(
    code,
  );
}

export function setStatus(run: PipelineRun, status: PipelineStatus): PipelineRun {
  const isFailed = status === "FAILED";
  return {
    ...run,
    status,
    updatedAt: nowIso(),
    error: isFailed ? run.error : null,
    failedStage: isFailed ? run.failedStage : null,
    errorCode: isFailed ? run.errorCode : null,
    retryable: isFailed ? run.retryable : false,
  };
}

/** Top-level statuses that mean work is still in flight. */
export const IN_FLIGHT_STATUSES: readonly PipelineStatus[] = [
  "RESEARCHING",
  "GENERATING",
  "QUALITY_CHECK",
];

export function findRunningStage(run: PipelineRun): StageRecord | undefined {
  return run.stages.find((s) => s.status === "running");
}

/** True when the run looks mid-stage (status or a stage still marked running). */
export function isInFlightRun(run: PipelineRun): boolean {
  if (IN_FLIGHT_STATUSES.includes(run.status)) return true;
  return Boolean(findRunningStage(run));
}

function inferInterruptedStage(run: PipelineRun): string {
  const running = findRunningStage(run);
  if (running?.stage) return running.stage;
  if (run.status === "GENERATING") return "generation";
  if (run.status === "RESEARCHING") return "research";
  if (run.status === "QUALITY_CHECK") return "quality";
  return "pipeline";
}

/** How long the current in-flight stage (or last update) has been open. */
export function inFlightAgeMs(run: PipelineRun, now = Date.now()): number {
  const running = findRunningStage(run);
  const startedAt = running?.startedAt ?? run.updatedAt;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, now - start);
}

