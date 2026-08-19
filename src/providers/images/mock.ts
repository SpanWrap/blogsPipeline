import type { GeneratedImage, ImageProvider } from "./types";

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";

  async generateImage(prompt: string): Promise<GeneratedImage> {
    return {
      url: null,
      base64: null,
      mimeType: "image/png",
      prompt,
      type: "hero",
      altText: `Mock image: ${prompt.slice(0, 80)}`,
    };
  }

  async generateBlogImages(article: {
    title: string;
    excerpt: string;
    content: string;
    tags: string[];
  }): Promise<GeneratedImage[]> {
    return [
      {
        url: null,
        base64: null,
        mimeType: "image/png",
        prompt: `Hero for: ${article.title}`,
        type: "hero",
        altText: `Hero image for ${article.title}`,
      },
    ];
  }
}
