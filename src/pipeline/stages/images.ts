import { createImageProvider, type GeneratedImage } from "../../providers/images";
import { WebSearchImageProvider } from "../../providers/images/web-search";
import { logger } from "../../services/logger";
import type { GeneratedBlog } from "../../models";
import { getDataFs } from "../../services/data-fs";
import path from "node:path";

export type ImageStageResult = {
  heroImage: GeneratedImage | null;
  sectionImages: GeneratedImage[];
  socialImage: GeneratedImage | null;
  savedPaths: string[];
  /** Which provider produced the usable images. */
  provider: string;
  /** Set when Gemini failed/was skipped and web search was used. */
  fallbackFrom?: string | null;
};

async function saveBase64Image(
  base64: string,
  mimeType: string,
  filename: string,
  runId: string,
): Promise<string> {
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const name = `${filename}.${ext}`;
  const key = `images/${runId}/${name}`;
  const contentType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  await getDataFs().writeBytes(key, Buffer.from(base64, "base64"), contentType);
  return key;
}

async function materializeImages(
  allImages: GeneratedImage[],
  runId: string,
  provider: string,
  fallbackFrom?: string | null,
): Promise<ImageStageResult> {
  const savedPaths: string[] = [];

  for (let i = 0; i < allImages.length; i++) {
    const img = allImages[i]!;
    if (img.base64) {
      const saved = await saveBase64Image(img.base64, img.mimeType, `${img.type}-${i}`, runId);
      savedPaths.push(saved);
    }
  }

  const heroImage = allImages.find((i) => i.type === "hero") ?? null;
  const sectionImages = allImages.filter((i) => i.type === "section");
  const socialImage = allImages.find((i) => i.type === "social") ?? null;

  logger.info("Image materialization complete", {
    provider,
    fallbackFrom: fallbackFrom ?? null,
    total: allImages.length,
    saved: savedPaths.length,
    remoteOnly: allImages.filter((i) => !i.base64 && i.url).length,
  });

  return {
    heroImage,
    sectionImages,
    socialImage,
    savedPaths,
    provider,
    fallbackFrom: fallbackFrom ?? null,
  };
}

function hasUsableImages(result: ImageStageResult): boolean {
  if (result.savedPaths.length > 0) return true;
  if (result.heroImage?.url || result.heroImage?.base64) return true;
  if (result.sectionImages.some((i) => i.url || i.base64)) return true;
  if (result.socialImage?.url || result.socialImage?.base64) return true;
  return false;
}

export async function imageStage(
  article: GeneratedBlog,
  runId: string,
): Promise<ImageStageResult> {
  const primary = createImageProvider();
  let geminiError: string | null = null;

  if (primary.name !== "mock") {
    try {
      logger.info("Generating blog images", { provider: primary.name, runId });
      const allImages = await primary.generateBlogImages({
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
        tags: article.tags,
      });
      const result = await materializeImages(allImages, runId, primary.name);
      if (hasUsableImages(result)) return result;
      geminiError = "Gemini returned no usable image data";
      logger.warn(geminiError, { runId, provider: primary.name });
    } catch (error) {
      geminiError = error instanceof Error ? error.message : String(error);
      logger.warn("Gemini image generation failed; falling back to web search", {
        runId,
        error: geminiError.slice(0, 300),
      });
    }
  } else {
    geminiError = "No Gemini API key configured";
    logger.info("Skipping Gemini images; using web image search", { runId });
  }

  const web = new WebSearchImageProvider();
  logger.info("Searching the web for relevant blog images", {
    runId,
    reason: geminiError,
  });
  const webImages = await web.generateBlogImages({
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    tags: article.tags,
  });
  const webResult = await materializeImages(webImages, runId, web.name, geminiError);
  if (!hasUsableImages(webResult)) {
    throw new Error(
      `Image generation failed (${geminiError || "unknown"}). Web image search also found nothing usable.`,
    );
  }
  return webResult;
}

export function publicImageUrl(runId: string, filename: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/images/${encodeURIComponent(filename)}`;
}

/** Attach generated or searched images to the article as featured URL + inline Markdown. */
export function applyGeneratedImages(
  article: GeneratedBlog,
  result: ImageStageResult,
  runId: string,
): GeneratedBlog {
  const filenames = result.savedPaths.map((saved) => path.basename(saved));
  const heroFile = filenames.find((name) => name.startsWith("hero-"));
  const sectionFiles = filenames.filter((name) => name.startsWith("section-"));
  let content = article.content;
  const headings = content.match(/^## .+$/gm) ?? [];

  const sectionUrls: string[] = sectionFiles.map((file) => publicImageUrl(runId, file));
  // Prefer saved files; otherwise use remote search URLs.
  if (!sectionUrls.length) {
    for (const img of result.sectionImages) {
      if (img.url) sectionUrls.push(img.url);
    }
  }

  for (let i = 0; i < Math.min(sectionUrls.length, headings.length); i++) {
    const heading = headings[i]!;
    const imageUrl = sectionUrls[i]!;
    const alt = result.sectionImages[i]?.altText || heading.replace(/^##\s+/, "");
    const imageMd = `![${alt}](${imageUrl})`;
    if (content.includes(imageMd) || content.includes(`](${imageUrl})`)) continue;
    const idx = content.indexOf(heading);
    if (idx < 0) continue;
    const end = content.indexOf("\n", idx);
    const insertAt = end === -1 ? content.length : end + 1;
    content = `${content.slice(0, insertAt)}\n${imageMd}\n${content.slice(insertAt)}`;
  }

  const featuredImage =
    article.featuredImage ||
    (heroFile ? publicImageUrl(runId, heroFile) : null) ||
    result.heroImage?.url ||
    null;

  return { ...article, content, featuredImage };
}
