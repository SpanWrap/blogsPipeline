import { appConfig } from "../../config";
import { logger } from "../../services/logger";
import { withRetry } from "../../utils/retry";
export class GeminiImageProvider {
    apiKey;
    name = "gemini";
    constructor(apiKey = appConfig.images?.geminiApiKey ?? appConfig.llm.apiKey) {
        this.apiKey = apiKey;
    }
    async generateImage(prompt, options = {}) {
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
        return withRetry(async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 60_000);
            try {
                const body = {
                    contents: [
                        {
                            parts: [
                                {
                                    text: `Generate a professional blog illustration: ${prompt}${options.style ? `. Style: ${options.style}` : ""}. Make it clean, modern, and suitable for a tech blog.`,
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        responseModalities: ["IMAGE", "TEXT"],
                        imageSizeOptions: {
                            aspectRatio: options.aspectRatio || "16:9",
                        },
                    },
                };
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${this.apiKey}`, {
                    method: "POST",
                    signal: controller.signal,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Gemini image API error ${response.status}: ${errText.slice(0, 300)}`);
                }
                const data = (await response.json());
                const parts = data.candidates?.[0]?.content?.parts ?? [];
                const imagePart = parts.find((p) => p.inlineData);
                if (!imagePart?.inlineData) {
                    logger.warn("Gemini did not return an image", { prompt: prompt.slice(0, 80) });
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
                    base64: imagePart.inlineData.data,
                    mimeType: imagePart.inlineData.mimeType,
                    prompt,
                    type: "hero",
                    altText: prompt.slice(0, 120),
                };
            }
            finally {
                clearTimeout(timer);
            }
        }, { maxAttempts: 2, baseDelayMs: 2000 });
    }
    async generateBlogImages(article) {
        const images = [];
        const heroPrompt = `A visually striking hero image for a tech blog post titled "${article.title}". ${article.excerpt}. Tags: ${article.tags.join(", ")}`;
        const hero = await this.generateImage(heroPrompt, { aspectRatio: "16:9" });
        hero.type = "hero";
        images.push(hero);
        const h2s = article.content.match(/^## .+$/gm) ?? [];
        const sectionHeadings = h2s.slice(0, 3);
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
        return images;
    }
}
