import { appConfig } from "../../config";
import type { PublishResult, PublishableBlog } from "../../models";
import { logger } from "../../services/logger";
import { withRetry } from "../../utils/retry";
import type { Publisher } from "./types";

const PUBLISH_POST_MUTATION = `
  mutation PublishPost($input: PublishPostInput!) {
    publishPost(input: $input) {
      post {
        id
        slug
        url
      }
    }
  }
`;

export class HashnodePublisher implements Publisher {
  readonly name = "hashnode";

  private get token() {
    return appConfig.publishing.hashnode.token;
  }

  private get publicationId() {
    return appConfig.publishing.hashnode.publicationId;
  }

  private get canonicalBase() {
    return appConfig.publishing.hashnode.canonicalBase;
  }

  async publish(
    blog: PublishableBlog,
    options: { idempotencyKey: string },
  ): Promise<PublishResult> {
    if (!this.token || !this.publicationId) {
      return {
        success: false,
        message: "HASHNODE_TOKEN or HASHNODE_PUBLICATION_ID is not configured",
        statusCode: 401,
        idempotencyKey: options.idempotencyKey,
      };
    }

    try {
      const result = await withRetry(
        async () => {
          const tags = blog.tags.slice(0, 5).map((t) => ({
            slug: t.toLowerCase().replace(/\s+/g, "-"),
            name: t,
          }));

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
          try {
            const response = await fetch("https://gql.hashnode.com", {
              method: "POST",
              signal: controller.signal,
              headers: {
                Authorization: this.token!,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query: PUBLISH_POST_MUTATION,
                variables: {
                  input: {
                    title: blog.title,
                    contentMarkdown: blog.content,
                    tags,
                    subtitle: blog.excerpt,
                    publicationId: this.publicationId,
                    slug: blog.slug,
                    ...(blog.featuredImage ? { coverImageOptions: { coverImageURL: blog.featuredImage } } : {}),
                    ...(this.canonicalBase
                      ? { originalArticleURL: `${this.canonicalBase.replace(/\/$/, "")}/${blog.slug}` }
                      : {}),
                  },
                },
              }),
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
                message: `Hashnode auth failed (${response.status})`,
                idempotencyKey: options.idempotencyKey,
                raw,
              } satisfies PublishResult;
            }

            if (response.status === 429 || response.status >= 500) {
              const error = new Error(`Hashnode temporary error ${response.status}`) as Error & { status: number };
              error.status = response.status;
              throw error;
            }

            if (!response.ok) {
              return {
                success: false,
                statusCode: response.status,
                message: `Hashnode publish failed with HTTP ${response.status}`,
                idempotencyKey: options.idempotencyKey,
                raw,
              } satisfies PublishResult;
            }

            // Check for GraphQL-level errors
            const body = raw as { data?: { publishPost?: { post?: { id: string } } }; errors?: Array<{ message: string }> };
            if (body.errors?.length) {
              return {
                success: false,
                statusCode: response.status,
                message: `Hashnode GraphQL error: ${body.errors[0]!.message}`,
                idempotencyKey: options.idempotencyKey,
                raw,
              } satisfies PublishResult;
            }

            const postId = body.data?.publishPost?.post?.id;

            return {
              success: true,
              externalId: postId,
              statusCode: response.status,
              message: "Published to Hashnode",
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
            logger.warn("Retrying Hashnode publish", {
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
        message: error instanceof Error ? error.message : "Hashnode publish failed",
        idempotencyKey: options.idempotencyKey,
      };
    }
  }
}
