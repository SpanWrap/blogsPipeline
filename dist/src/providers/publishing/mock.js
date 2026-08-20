const publishedKeys = new Map();
export class MockPublisher {
    behavior;
    name = "mock-publisher";
    constructor(behavior = "success") {
        this.behavior = behavior;
    }
    async publish(blog, options) {
        const existing = publishedKeys.get(options.idempotencyKey);
        if (existing?.success) {
            return { ...existing, message: "Idempotent replay: already published" };
        }
        if (this.behavior === "auth") {
            return {
                success: false,
                statusCode: 401,
                message: "Unauthorized",
                idempotencyKey: options.idempotencyKey,
            };
        }
        if (this.behavior === "validation") {
            return {
                success: false,
                statusCode: 400,
                message: "Validation failed",
                idempotencyKey: options.idempotencyKey,
            };
        }
        if (this.behavior === "rate_limit") {
            return {
                success: false,
                statusCode: 429,
                message: "Rate limited",
                idempotencyKey: options.idempotencyKey,
            };
        }
        if (this.behavior === "server") {
            return {
                success: false,
                statusCode: 500,
                message: "Server error",
                idempotencyKey: options.idempotencyKey,
            };
        }
        if (this.behavior === "timeout") {
            return {
                success: false,
                message: "Request timeout",
                idempotencyKey: options.idempotencyKey,
            };
        }
        const result = {
            success: true,
            externalId: `sw_${blog.slug}`,
            statusCode: 201,
            message: "Published successfully",
            idempotencyKey: options.idempotencyKey,
            raw: { id: `sw_${blog.slug}`, slug: blog.slug },
        };
        publishedKeys.set(options.idempotencyKey, result);
        return result;
    }
}
/** Test helper to clear idempotency memory. */
export function resetMockPublisherState() {
    publishedKeys.clear();
}
