import { createImageProvider, type GeneratedImage } from "../../providers/images";
import { logger } from "../../services/logger";
import type { GeneratedBlog } from "../../models";
import { appConfig } from "../../config";
import { mkdir, writeFile } from "node:fs/promises";
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
  outputDir: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const filePath = path.join(outputDir, `${filename}.${ext}`);
  await writeFile(filePath, Buffer.from(base64, "base64"));
  return filePath;
}

export async function imageStage(
  article: GeneratedBlog,
  runId: string,
): Promise<ImageStageResult> {
  const provider = createImageProvider();
  const outputDir = path.join(appConfig.images.outputDir, runId);

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
      const saved = await saveBase64Image(
        img.base64,
        img.mimeType,
        `${img.type}-${i}`,
        outputDir,
      );
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
