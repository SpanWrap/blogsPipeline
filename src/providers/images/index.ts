import type { ImageProvider } from "./types";
import { MockImageProvider } from "./mock";
import { GeminiImageProvider } from "./gemini";

export function createImageProvider(override?: "gemini" | "mock"): ImageProvider {
  if (override === "mock") return new MockImageProvider();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey) return new MockImageProvider();
  return new GeminiImageProvider(geminiKey);
}

export type { ImageProvider, GeneratedImage } from "./types";
export { GeminiImageProvider } from "./gemini";
export { MockImageProvider } from "./mock";
