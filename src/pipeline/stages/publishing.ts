import type {
  GeneratedBlog,
  PublishableBlog,
  PublishResult,
  PublishTarget,
  TargetPublishResult,
} from "../../models";
import type { Publisher } from "../../providers/publishing";
import sanitizeHtml from "sanitize-html";
import { resolveFeaturedImage } from "../../utils/images";

const SITE_LABEL: Record<PublishTarget, string> = {
  spanwrap: "Spanwrap",
  medium: "Medium",
  substack: "Substack",
};

function sanitizeContent(content: string): string {
  // Content is Markdown; strip any embedded HTML tags for safety.
  return sanitizeHtml(content, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

export function toPublishableBlog(article: GeneratedBlog): PublishableBlog {
  return {
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: sanitizeContent(article.content),
    tags: article.tags,
    keywords: article.keywords,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    featuredImage: resolveFeaturedImage({
      featuredImage: article.featuredImage,
      content: article.content,
      sourceUrls: article.sources.map((s) => s.url),
    }),
    publishedAt: null,
    sources: article.sources.map((s) => ({
      title: s.title,
      url: s.url,
      sourceName: s.sourceName,
    })),
  };
}

export function isLivePublishTarget(target: PublishTarget): boolean {
  return target === "spanwrap";
}

export async function publishingStage(
  article: GeneratedBlog,
  publisher: Publisher,
  idempotencyKey: string,
  targets: PublishTarget[] = ["spanwrap"],
): Promise<{ primary: PublishResult; results: TargetPublishResult[] }> {
  const blog = toPublishableBlog(article);
  const selected = targets.length ? targets : (["spanwrap"] as PublishTarget[]);
  const results: TargetPublishResult[] = [];

  for (const target of selected) {
    if (isLivePublishTarget(target)) {
      const result = await publisher.publish(blog, {
        idempotencyKey: `${idempotencyKey}:${target}`,
      });
      results.push({ ...result, target });
    } else {
      results.push({
        target,
        success: false,
        statusCode: 501,
        message: `${SITE_LABEL[target]} publishing is not wired yet (planned).`,
        idempotencyKey: `${idempotencyKey}:${target}`,
      });
    }
  }

  const live = results.filter((r) => isLivePublishTarget(r.target));
  const primary = live[0] ?? results[0]!;
  return { primary, results };
}
