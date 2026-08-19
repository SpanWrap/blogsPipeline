import { appConfig } from "../../config";
import type { PublishResult, PublishableBlog } from "../../models";
import { logger } from "../../services/logger";
import { withRetry } from "../../utils/retry";
import type { Publisher } from "./types";

export class MediumPublisher implements Publisher {
  readonly name = "medium";

  private cachedUserId: string | null = null;

  private get token() {
    return appConfig.publishing.medium.token;
  }

  private get canonicalBase() {
    return appConfig.publishing.medium.canonicalBase;
  }

  private async getUserId(): Promise<string> {
    if (this.cachedUserId) return this.cachedUserId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
    try {
      const res = await fetch("https://api.medium.com/v1/me", {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) throw new Error(`Failed to fetch Medium user: ${res.status}`);
      const body = (await res.json()) as { data: { id: string } };
      this.cachedUserId = body.data.id;
      return this.cachedUserId;
    } finally {
      clearTimeout(timer);
    }
  }

  async publish(
    blog: PublishableBlog,
    options: { idempotencyKey: string },
  ): Promise<PublishResult> {
    if (!this.token) {
      return {
        success: false,
        message: "MEDIUM_TOKEN is not configured",
        statusCode: 401,
        idempotencyKey: options.idempotencyKey,
      };
    }

    try {
      const result = await withRetry(
        async () => {
          const userId = await this.getUserId();
          const canonicalUrl = this.canonicalBase
            ? `${this.canonicalBase.replace(/\/$/, "")}/${blog.slug}`
            : undefined;

          const contentPrefix = canonicalUrl
            ? `*Originally published at [${canonicalUrl}](${canonicalUrl})*\n\n`
            : "";

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
          try {
            const response = await fetch(
              `https://api.medium.com/v1/users/${userId}/posts`,
              {
                method: "POST",
                signal: controller.signal,
                headers: {
                  Authorization: `Bearer ${this.token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  title: blog.title,
                  contentFormat: "markdown",
                  content: contentPrefix + blog.content,
                  tags: blog.tags.slice(0, 5),
                  canonicalUrl,
                  publishStatus: "draft",
                }),
              },
            );

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
                message: `Medium auth failed (${response.status})`,
                idempotencyKey: options.idempotencyKey,
                raw,
              } satisfies PublishResult;
            }

            if (response.status === 400 || response.status === 404 || response.status === 422) {
              return {
                success: false,
                statusCode: response.status,
                message: `Medium validation error (${response.status})`,
                idempotencyKey: options.idempotencyKey,
                raw,
              } satisfies PublishResult;
            }

            if (response.status === 429 || response.status >= 500) {
              const error = new Error(`Medium temporary error ${response.status}`) as Error & { status: number };
              error.status = response.status;
              throw error;
            }

            if (!response.ok) {
              return {
                success: false,
                statusCode: response.status,
                message: `Medium publish failed with HTTP ${response.status}`,
                idempotencyKey: options.idempotencyKey,
                raw,
              } satisfies PublishResult;
            }

            const externalId =
              raw && typeof raw === "object" && "data" in raw
                ? String((raw as { data: { id: string } }).data.id)
                : undefined;

            return {
              success: true,
              externalId,
              statusCode: response.status,
              message: "Published to Medium as draft",
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
            logger.warn("Retrying Medium publish", {
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
        message: error instanceof Error ? error.message : "Medium publish failed",
        idempotencyKey: options.idempotencyKey,
      };
    }
  }
}
