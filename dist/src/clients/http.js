import { appConfig } from "../config";
import { isTransientError, withRetry } from "../utils/retry";
export class HttpStatusError extends Error {
    status;
    url;
    constructor(status, url, detail) {
        super(detail ? `HTTP ${status} for ${url}: ${detail}` : `HTTP ${status} for ${url}`);
        this.name = "HttpStatusError";
        this.status = status;
        this.url = url;
    }
}
async function requestOnce(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? appConfig.requestTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: options.method ?? "GET",
            signal: controller.signal,
            headers: {
                "User-Agent": options.userAgent ?? appConfig.userAgent,
                Accept: options.accept ?? "application/json",
                ...options.headers,
            },
            body: options.body,
            redirect: "follow",
        });
        if (!response.ok) {
            let detail = "";
            try {
                detail = (await response.text()).slice(0, 180);
            }
            catch {
                detail = "";
            }
            throw new HttpStatusError(response.status, url, detail);
        }
        return response;
    }
    finally {
        clearTimeout(timer);
    }
}
export async function request(url, options = {}) {
    if (options.retry === false)
        return requestOnce(url, options);
    return withRetry(() => requestOnce(url, options), {
        maxAttempts: appConfig.retry.maxAttempts,
        baseDelayMs: appConfig.retry.baseDelayMs,
        shouldRetry: (error) => isTransientError(error),
    });
}
export async function requestJson(url, options = {}) {
    const response = await request(url, options);
    return (await response.json());
}
export async function requestText(url, options = {}) {
    const response = await request(url, {
        ...options,
        accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    });
    return await response.text();
}
