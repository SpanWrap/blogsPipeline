export async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
export function isTransientError(error) {
    if (!error || typeof error !== "object")
        return false;
    const e = error;
    const status = e.status ?? e.statusCode;
    if (status === 413)
        return false;
    if (status === 429 || status === 408)
        return true;
    if (typeof status === "number" && status >= 500)
        return true;
    if (e.name === "AbortError" || e.name === "TimeoutError")
        return true;
    if (e.code === "ECONNRESET" ||
        e.code === "ETIMEDOUT" ||
        e.code === "ECONNREFUSED" ||
        e.code === "ENOTFOUND") {
        // ENOTFOUND is usually permanent DNS, don't retry infinitely
        return e.code !== "ENOTFOUND";
    }
    const message = (e.message ?? "").toLowerCase();
    return (message.includes("timeout") ||
        message.includes("rate limit") ||
        message.includes("temporar") ||
        message.includes("network"));
}
export async function withRetry(fn, options = {}) {
    const maxAttempts = options.maxAttempts ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 500;
    const shouldRetry = options.shouldRetry ?? isTransientError;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn(attempt);
        }
        catch (error) {
            lastError = error;
            if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
                throw error;
            }
            const delayMs = baseDelayMs * 2 ** (attempt - 1);
            options.onRetry?.(error, attempt, delayMs);
            await sleep(delayMs);
        }
    }
    throw lastError;
}
