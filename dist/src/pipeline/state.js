export function nowIso() {
    return new Date().toISOString();
}
export function startStage(run, stage, extra) {
    const record = {
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
export function completeStage(run, stage, meta = {}) {
    const stages = run.stages.map((s) => {
        if (s.stage !== stage)
            return s;
        const endedAt = nowIso();
        const start = s.startedAt ? Date.parse(s.startedAt) : Date.now();
        return {
            ...s,
            status: "completed",
            endedAt,
            durationMs: Math.max(0, Date.parse(endedAt) - start),
            meta: { ...s.meta, ...meta },
            error: null,
        };
    });
    return { ...run, stages, updatedAt: nowIso() };
}
export function failStage(run, stage, error, opts) {
    const stages = run.stages.map((s) => {
        if (s.stage !== stage)
            return s;
        const endedAt = nowIso();
        const start = s.startedAt ? Date.parse(s.startedAt) : Date.now();
        return {
            ...s,
            status: "failed",
            endedAt,
            durationMs: Math.max(0, Date.parse(endedAt) - start),
            error,
        };
    });
    return {
        ...run,
        stages,
        status: "FAILED",
        error,
        failedStage: stage,
        errorCode: opts?.errorCode ?? classifyErrorCode(error),
        retryable: opts?.retryable ?? isRetryableError(error),
        updatedAt: nowIso(),
    };
}
/** Derive a machine-readable error code from an error message. */
function classifyErrorCode(message) {
    const m = message.toLowerCase();
    if (m.includes("timed out") || m.includes("timeout"))
        return "LLM_TIMEOUT";
    if (m.includes("rate limit") || m.includes("429") || m.includes("tpm"))
        return "RATE_LIMIT";
    if (m.includes("prompt too large") || m.includes("413"))
        return "PROMPT_TOO_LARGE";
    if (m.includes("no usable sources"))
        return "RESEARCH_EMPTY";
    if (m.includes("model") && (m.includes("not found") || m.includes("unavailable")))
        return "MODEL_NOT_FOUND";
    if (m.includes("api key"))
        return "AUTH_ERROR";
    if (m.includes("empty llm response"))
        return "EMPTY_RESPONSE";
    if (/5\d\d/.test(message))
        return "SERVER_ERROR";
    return "UNKNOWN";
}
/** Determine if the error is transient and worth retrying. */
function isRetryableError(message) {
    const code = classifyErrorCode(message);
    return ["LLM_TIMEOUT", "RATE_LIMIT", "SERVER_ERROR", "EMPTY_RESPONSE"].includes(code);
}
export function setStatus(run, status) {
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
