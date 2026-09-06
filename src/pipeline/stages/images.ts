import { createImageProvider, type GeneratedImage } from "../../providers/images";
import { logger } from "../../services/logger";
import type { GeneratedBlog } from "../../models";
import { getDataFs } from "../../services/data-fs";
import path from "node:path";

export type ImageStageResult = {
  heroImage: GeneratedImage | null;
  sectionImages: GeneratedImage[];
  socialImage: GeneratedImage | null;
  savedPaths: string[];
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

export async function imageStage(
  article: GeneratedBlog,
  runId: string,
): Promise<ImageStageResult> {
  const provider = createImageProvider();

  logger.info("Generating blog images", { provider: provider.name, runId });

  const allImages = await provider.generateBlogImages({
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    tags: article.tags,
  });

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

  logger.info("Image generation complete", {
    total: allImages.length,
    saved: savedPaths.length,
  });

  return { heroImage, sectionImages, socialImage, savedPaths };
}

export function publicImageUrl(runId: string, filename: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/images/${encodeURIComponent(filename)}`;
}

/** Attach generated images to the article as a featured URL and inline Markdown. */
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

  for (let i = 0; i < Math.min(sectionFiles.length, headings.length); i++) {
    const heading = headings[i]!;
    const file = sectionFiles[i]!;
    const alt = result.sectionImages[i]?.altText || heading.replace(/^##\s+/, "");
    const imageMd = `![${alt}](${publicImageUrl(runId, file)})`;
    if (content.includes(imageMd)) continue;
    const idx = content.indexOf(heading);
    if (idx < 0) continue;
    const end = content.indexOf("\n", idx);
    const insertAt = end === -1 ? content.length : end + 1;
    content = `${content.slice(0, insertAt)}\n${imageMd}\n${content.slice(insertAt)}`;
  }

  const featuredImage =
    article.featuredImage ||
    (heroFile ? publicImageUrl(runId, heroFile) : null);

  return { ...article, content, featuredImage };
}
