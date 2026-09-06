import type {
  GeneratedBlog,
  PublishableBlog,
  PublishResult,
  PublishTarget,
  TargetPublishResult,
} from "../../models";
import { createPublisherForTarget } from "../../providers/publishing";
import type { Publisher } from "../../providers/publishing";
import sanitizeHtml from "sanitize-html";
import { resolveFeaturedImage } from "../../utils/images";
import { rewriteAssetUrlsForPublish, toPublicAssetUrl } from "../../utils/public-assets";

const SITE_LABEL: Record<PublishTarget, string> = {
  spanwrap: "Spanwrap",
  medium: "Medium",
  devto: "Dev.to",
  hashnode: "Hashnode",
  wordpress: "WordPress",
  substack: "Substack",
};

function sanitizeContent(content: string): string {
  return sanitizeHtml(content, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

export function toPublishableBlog(article: GeneratedBlog): PublishableBlog {
  const content = rewriteAssetUrlsForPublish(sanitizeContent(article.content));
  const featured = resolveFeaturedImage({
    featuredImage: article.featuredImage,
    content: article.content,
    sourceUrls: article.sources.map((s) => s.url),
  });

  return {
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content,
    tags: article.tags,
    keywords: article.keywords,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    // External platforms need absolute https URLs (S3 public or pipeline.spanwrap.com).
    featuredImage: toPublicAssetUrl(featured),
    publishedAt: null,
    sources: article.sources.map((s) => ({
      title: s.title,
      url: s.url,
      sourceName: s.sourceName,
    })),
  };
}

export function isLivePublishTarget(target: PublishTarget): boolean {
  const envMap: Record<PublishTarget, string[]> = {
    spanwrap: ["SPANWRAP_API_KEY"],
    medium: ["MEDIUM_TOKEN"],
    devto: ["DEVTO_API_KEY"],
    hashnode: ["HASHNODE_TOKEN", "HASHNODE_PUBLICATION_ID"],
    wordpress: ["WORDPRESS_URL", "WORDPRESS_USER", "WORDPRESS_APP_PASSWORD"],
    substack: [],
  };
  const vars = envMap[target];
  if (!vars || vars.length === 0) return true;
  return vars.every((v) => process.env[v]);
}

export async function publishingStage(
  article: GeneratedBlog,
  spanwrapPublisher: Publisher,
  idempotencyKey: string,
  targets: PublishTarget[] = ["spanwrap"],
): Promise<{ primary: PublishResult; results: TargetPublishResult[] }> {
  const blog = toPublishableBlog(article);
  const selected = targets.length ? targets : (["spanwrap"] as PublishTarget[]);
  const results: TargetPublishResult[] = [];

  for (const target of selected) {
    if (target === "spanwrap") {
      const result = await spanwrapPublisher.publish(blog, {
        idempotencyKey: `${idempotencyKey}:${target}`,
      });
      results.push({ ...result, target });
    } else if (isLivePublishTarget(target)) {
      const pub = createPublisherForTarget(target);
      const result = await pub.publish(blog, {
        idempotencyKey: `${idempotencyKey}:${target}`,
      });
      results.push({ ...result, target });
    } else {
      results.push({
        target,
        success: false,
        statusCode: 501,
        message: `${SITE_LABEL[target]} credentials not configured.`,
        idempotencyKey: `${idempotencyKey}:${target}`,
      });
    }
  }

  const live = results.filter((r) => r.target === "spanwrap" || isLivePublishTarget(r.target));
  const primary = live[0] ?? results[0]!;
  return { primary, results };
}
