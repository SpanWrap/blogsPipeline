import { appConfig } from "../../config";
import { logger } from "../../services/logger";
import { withRetry } from "../../utils/retry";
export class WordPressPublisher {
    name = "wordpress";
    get url() {
        return appConfig.publishing.wordpress.url;
    }
    get user() {
        return appConfig.publishing.wordpress.user;
    }
    get appPassword() {
        return appConfig.publishing.wordpress.appPassword;
    }
    getAuthHeader() {
        const credentials = Buffer.from(`${this.user}:${this.appPassword}`).toString("base64");
        return `Basic ${credentials}`;
    }
    async publish(blog, options) {
        if (!this.url || !this.user || !this.appPassword) {
            return {
                success: false,
                message: "WordPress credentials (WORDPRESS_URL, WORDPRESS_USER, WORDPRESS_APP_PASSWORD) not configured",
                statusCode: 401,
                idempotencyKey: options.idempotencyKey,
            };
        }
        try {
            const result = await withRetry(async () => {
                const endpoint = `${this.url.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
                try {
                    const response = await fetch(endpoint, {
                        method: "POST",
                        signal: controller.signal,
                        headers: {
                            Authorization: this.getAuthHeader(),
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            title: blog.title,
                            content: blog.content,
                            excerpt: blog.excerpt,
                            slug: blog.slug,
                            status: "draft",
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
                            message: `WordPress auth failed (${response.status})`,
                            idempotencyKey: options.idempotencyKey,
                            raw,
                        };
                    }
                    if (response.status === 400 || response.status === 404 || response.status === 422) {
                        return {
                            success: false,
                            statusCode: response.status,
                            message: `WordPress validation error (${response.status})`,
                            idempotencyKey: options.idempotencyKey,
                            raw,
                        };
                    }
                    if (response.status === 429 || response.status >= 500) {
                        const error = new Error(`WordPress temporary error ${response.status}`);
                        error.status = response.status;
                        throw error;
                    }
                    if (!response.ok) {
                        return {
                            success: false,
                            statusCode: response.status,
                            message: `WordPress publish failed with HTTP ${response.status}`,
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
                        message: "Published to WordPress as draft",
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
                    logger.warn("Retrying WordPress publish", {
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
                message: error instanceof Error ? error.message : "WordPress publish failed",
                idempotencyKey: options.idempotencyKey,
            };
        }
    }
}
