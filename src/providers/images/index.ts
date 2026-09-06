import type { ImageProvider } from "./types";
import { MockImageProvider } from "./mock";
import { GeminiImageProvider } from "./gemini";
import { WebSearchImageProvider } from "./web-search";

export function createImageProvider(override?: "gemini" | "mock" | "web-search"): ImageProvider {
  if (override === "mock") return new MockImageProvider();
  if (override === "web-search") return new WebSearchImageProvider();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey) return new MockImageProvider();
  return new GeminiImageProvider(geminiKey);
}

export type { ImageProvider, GeneratedImage } from "./types";
export { GeminiImageProvider } from "./gemini";
export { MockImageProvider } from "./mock";
export { WebSearchImageProvider, searchWebImages } from "./web-search";
