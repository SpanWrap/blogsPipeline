import { appConfig } from "../../config";
import { logger } from "../../services/logger";
import { withRetry } from "../../utils/retry";
import type { GeneratedImage, ImageProvider } from "./types";

/** Prefer current image models; fall back if Google retires a preview id. */
const GEMINI_IMAGE_MODELS = [
  process.env.GEMINI_IMAGE_MODEL,
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
].filter((m): m is string => Boolean(m && m.trim()));

export class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey = appConfig.images?.geminiApiKey ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_API_KEY ??
      appConfig.llm.apiKey,
  ) {}

  async generateImage(
    prompt: string,
    options: { aspectRatio?: string; style?: string } = {},
  ): Promise<GeneratedImage> {
    if (!this.apiKey) {
      logger.warn("No Gemini API key for image generation; returning placeholder");
      return {
        url: null,
        base64: null,
        mimeType: "image/png",
        prompt,
        type: "hero",
        altText: prompt.slice(0, 120),
      };
    }

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 90_000);
        try {
          const text = `Generate a professional blog illustration: ${prompt}${
            options.style ? `. Style: ${options.style}` : ""
          }. Aspect ratio about ${options.aspectRatio || "16:9"}. Make it clean, modern, and suitable for a tech blog. Do not include watermarks or UI chrome.`;

          let lastError: Error | null = null;
          for (const model of GEMINI_IMAGE_MODELS) {
            try {
              const image = await this.requestImage(model, text, controller.signal);
              if (image.base64) return image;
              lastError = new Error(`Gemini model ${model} returned no image bytes`);
            } catch (error) {
              lastError = error instanceof Error ? error : new Error(String(error));
              const msg = lastError.message.toLowerCase();
              // Try next model when this id is gone / not found.
              if (
                msg.includes("404") ||
                msg.includes("not found") ||
                msg.includes("not supported") ||
                msg.includes("is not available")
              ) {
                logger.warn("Gemini image model unavailable; trying fallback", {
                  model,
                  error: lastError.message.slice(0, 200),
                });
                continue;
              }
              throw lastError;
            }
          }

          logger.warn("Gemini did not return an image after model fallbacks", {
            prompt: prompt.slice(0, 80),
            error: lastError?.message.slice(0, 200),
          });
          return {
            url: null,
            base64: null,
            mimeType: "image/png",
            prompt,
            type: "hero",
            altText: prompt.slice(0, 120),
          };
        } finally {
          clearTimeout(timer);
        }
      },
      { maxAttempts: 2, baseDelayMs: 2000 },
    );
  }

  private async requestImage(
    model: string,
    prompt: string,
    signal: AbortSignal,
  ): Promise<GeneratedImage> {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini image API error ${response.status}: ${errText.slice(0, 400)}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
            inline_data?: { mime_type: string; data: string };
          }>;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData || p.inline_data);
    const inline = imagePart?.inlineData ??
      (imagePart?.inline_data
        ? {
            mimeType: imagePart.inline_data.mime_type,
            data: imagePart.inline_data.data,
          }
        : null);

    if (!inline?.data) {
      return {
        url: null,
        base64: null,
        mimeType: "image/png",
        prompt,
        type: "hero",
        altText: prompt.slice(0, 120),
      };
    }

    return {
      url: null,
      base64: inline.data,
      mimeType: inline.mimeType || "image/png",
      prompt,
      type: "hero",
      altText: prompt.slice(0, 120),
    };
  }

  async generateBlogImages(article: {
    title: string;
    excerpt: string;
    content: string;
    tags: string[];
  }): Promise<GeneratedImage[]> {
    const images: GeneratedImage[] = [];
    const maxSections = Math.max(0, appConfig.images.maxSectionImages);

    const heroPrompt = `A visually striking hero image for a tech blog post titled "${article.title}". ${article.excerpt}. Tags: ${article.tags.join(", ")}`;
    const hero = await this.generateImage(heroPrompt, { aspectRatio: "16:9" });
    hero.type = "hero";
    images.push(hero);

    const h2s = article.content.match(/^## .+$/gm) ?? [];
    const sectionHeadings = h2s.slice(0, maxSections);

    for (const heading of sectionHeadings) {
      const clean = heading.replace(/^## /, "");
      const sectionPrompt = `A clean, minimal illustration for a blog section about "${clean}" in the context of "${article.title}". Use flat design, tech-inspired visuals.`;
      const img = await this.generateImage(sectionPrompt, { aspectRatio: "16:9" });
      img.type = "section";
      img.altText = `Illustration for: ${clean}`;
      images.push(img);
    }

    const socialPrompt = `A social media card image for a blog post: "${article.title}". Bold, eye-catching, minimal text area for overlays.`;
    const social = await this.generateImage(socialPrompt, { aspectRatio: "1:1" });
    social.type = "social";
    images.push(social);

    const withBytes = images.filter((i) => i.base64);
    if (!withBytes.length) {
      throw new Error(
        "Gemini returned no image data. Check GEMINI_API_KEY permissions for image generation, or set GEMINI_IMAGE_MODEL.",
      );
    }

    return images;
  }
}
