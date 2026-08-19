export type GeneratedImage = {
  url: string | null;
  base64: string | null;
  mimeType: string;
  prompt: string;
  type: "hero" | "section" | "social" | "thumbnail";
  altText: string;
};

export interface ImageProvider {
  readonly name: string;
  generateImage(prompt: string, options?: {
    aspectRatio?: "1:1" | "16:9" | "4:3" | "3:4" | "9:16";
    style?: string;
  }): Promise<GeneratedImage>;
  generateBlogImages(article: {
    title: string;
    excerpt: string;
    content: string;
    tags: string[];
  }): Promise<GeneratedImage[]>;
}
