import type { GeneratedBlog, PublishResult, PublishableBlog } from "../../models";
import type { Publisher } from "../../providers/publishing";
import sanitizeHtml from "sanitize-html";

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
    featuredImage: null,
    publishedAt: null,
    sources: article.sources.map((s) => ({
      title: s.title,
      url: s.url,
      sourceName: s.sourceName,
    })),
  };
}

export async function publishingStage(
  article: GeneratedBlog,
  publisher: Publisher,
  idempotencyKey: string,
): Promise<PublishResult> {
  const blog = toPublishableBlog(article);
  return publisher.publish(blog, { idempotencyKey });
}
