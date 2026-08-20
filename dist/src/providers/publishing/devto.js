import { appConfig } from "../../config";
import { logger } from "../../services/logger";
import { withRetry } from "../../utils/retry";
export class DevtoPublisher {
    name = "devto";
    get apiKey() {
        return appConfig.publishing.devto.apiKey;
    }
    get canonicalBase() {
        return appConfig.publishing.devto.canonicalBase;
    }
    async publish(blog, options) {
        if (!this.apiKey) {
            return {
                success: false,
                message: "DEVTO_API_KEY is not configured",
                statusCode: 401,
                idempotencyKey: options.idempotencyKey,
            };
        }
        try {
            const result = await withRetry(async () => {
                const canonicalUrl = this.canonicalBase
                    ? `${this.canonicalBase.replace(/\/$/, "")}/${blog.slug}`
                    : undefined;
                const tags = blog.tags
                    .slice(0, 4)
                    .map((t) => t.toLowerCase().replace(/\s+/g, ""));
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
                try {
                    const response = await fetch("https://dev.to/api/articles", {
                        method: "POST",
                        signal: controller.signal,
                        headers: {
                            "api-key": this.apiKey,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            article: {
                                title: blog.title,
                                body_markdown: blog.content,
                                tags,
                                canonical_url: canonicalUrl,
                                description: blog.excerpt,
                                published: false,
                            },
                        }),
                    });
                    const text = await response.text();
                    let raw = text;
                    try {
                        raw = text ? JSON.parse(text) : null;
                    }
                    catch {
                        // keep text
                    }
                    if (response.status === 401 || response.status === 403) {
                        return {
                            success: false,
                            statusCode: response.status,
                            message: `Dev.to auth failed (${response.status})`,
                            idempotencyKey: options.idempotencyKey,
                            raw,
                        };
                    }
                    if (response.status === 400 || response.status === 422) {
                        return {
                            success: false,
                            statusCode: response.status,
                            message: `Dev.to validation error (${response.status})`,
                            idempotencyKey: options.idempotencyKey,
                            raw,
                        };
                    }
                    if (response.status === 429 || response.status >= 500) {
                        const error = new Error(`Dev.to temporary error ${response.status}`);
                        error.status = response.status;
                        throw error;
                    }
                    if (!response.ok) {
                        return {
                            success: false,
                            statusCode: response.status,
                            message: `Dev.to publish failed with HTTP ${response.status}`,
                            idempotencyKey: options.idempotencyKey,
                            raw,
                        };
                    }
                    const externalId = raw && typeof raw === "object" && "id" in raw
                        ? String(raw.id)
                        : undefined;
                    return {
                        success: true,
                        externalId,
                        statusCode: response.status,
                        message: "Published to Dev.to as draft",
                        idempotencyKey: options.idempotencyKey,
                        raw,
                    };
                }
                finally {
                    clearTimeout(timer);
                }
            }, {
                maxAttempts: appConfig.retry.maxAttempts,
                baseDelayMs: appConfig.retry.baseDelayMs,
                onRetry: (error, attempt, delayMs) => {
                    logger.warn("Retrying Dev.to publish", {
                        attempt,
                        delayMs,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            });
            return result;
        }
        catch (error) {
            const status = error.status;
            return {
                success: false,
                statusCode: status,
                message: error instanceof Error ? error.message : "Dev.to publish failed",
                idempotencyKey: options.idempotencyKey,
            };
        }
    }
}
