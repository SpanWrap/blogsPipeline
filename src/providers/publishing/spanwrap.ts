import { appConfig } from "@/config";
import type { PublishResult, PublishableBlog } from "@/models";
import { logger } from "@/services/logger";
import { withRetry } from "@/utils/retry";
import type { Publisher } from "./types";

/**
 * Maps internal publishable blogs to the Spanwrap API payload.
 * All Spanwrap-specific field names live here only.
 */
export class SpanwrapPublisher implements Publisher {
  readonly name = "spanwrap";

  constructor(
    private readonly apiUrl = appConfig.spanwrap.apiUrl,
    private readonly apiKey = appConfig.spanwrap.apiKey,
    private readonly blogsPath = appConfig.spanwrap.blogsPath,
  ) {}

  private toPayload(blog: PublishableBlog) {
    return {
      title: blog.title,
      slug: blog.slug,
      excerpt: blog.excerpt,
      content: blog.content,
      tags: blog.tags,
      keywords: blog.keywords,
      seo_title: blog.seoTitle,
      seo_description: blog.seoDescription,
      featured_image: blog.featuredImage,
      published_at: blog.publishedAt,
      sources: blog.sources.map((s) => ({
        title: s.title,
        url: s.url,
        source_name: s.sourceName ?? null,
      })),
    };
  }

  async publish(
    blog: PublishableBlog,
    options: { idempotencyKey: string },
  ): Promise<PublishResult> {
    if (!this.apiKey) {
      return {
        success: false,
        message: "SPANWRAP_API_KEY is not configured",
        statusCode: 401,
        idempotencyKey: options.idempotencyKey,
      };
    }

    const endpoint = `${this.apiUrl.replace(/\/$/, "")}${this.blogsPath.startsWith("/") ? this.blogsPath : `/${this.blogsPath}`}`;
    const payload = this.toPayload(blog);

    try {
      const result = await withRetry(
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              signal: controller.signal,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
                "Idempotency-Key": options.idempotencyKey,
              },
              body: JSON.stringify(payload),
            });

            const text = await response.text();
            let raw: unknown = text;
            try {
              raw = text ? JSON.parse(text) : null;
            } catch {
              // keep text
            }

            if (response.status === 401 || response.status === 403) {
              return {
                success: false,
                statusCode: response.status,
                message: `Authentication/authorization failed (${response.status})`,
                idempotencyKey: options.idempotencyKey,
                raw,
              } satisfies PublishResult;
            }

            if (response.status === 400 || response.status === 404 || response.status === 422) {
              return {
                success: false,
                statusCode: response.status,
                message: `Validation or not-found error (${response.status})`,
                idempotencyKey: options.idempotencyKey,
                raw,
              } satisfies PublishResult;
            }

            if (response.status === 429 || response.status >= 500) {
              const error = new Error(`Spanwrap temporary error ${response.status}`) as Error & {
                status: number;
              };
              error.status = response.status;
              throw error;
            }

            if (!response.ok) {
              return {
                success: false,
                statusCode: response.status,
                message: `Publish failed with HTTP ${response.status}`,
                idempotencyKey: options.idempotencyKey,
                raw,
              } satisfies PublishResult;
            }

            const externalId =
              raw && typeof raw === "object" && "id" in raw
                ? String((raw as { id: unknown }).id)
                : undefined;

            return {
              success: true,
              externalId,
              statusCode: response.status,
              message: "Published successfully",
              idempotencyKey: options.idempotencyKey,
              raw,
            } satisfies PublishResult;
          } finally {
            clearTimeout(timer);
          }
        },
        {
          maxAttempts: appConfig.retry.maxAttempts,
          baseDelayMs: appConfig.retry.baseDelayMs,
          onRetry: (error, attempt, delayMs) => {
            logger.warn("Retrying Spanwrap publish", {
              attempt,
              delayMs,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        },
      );
      return result;
    } catch (error) {
      const status = (error as { status?: number }).status;
      return {
        success: false,
        statusCode: status,
        message: error instanceof Error ? error.message : "Publish failed",
        idempotencyKey: options.idempotencyKey,
      };
    }
  }
}
