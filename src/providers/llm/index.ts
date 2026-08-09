import { appConfig } from "@/config";
import type { LLMProvider } from "./types";
import { MockLLMProvider } from "./mock";
import { OpenAICompatibleLLMProvider } from "./openai-compatible";

export function createLLMProvider(override?: "auto" | "openai" | "mock"): LLMProvider {
  const mode = override ?? appConfig.llm.provider;
  if (mode === "mock") return new MockLLMProvider();
  if (mode === "openai") return new OpenAICompatibleLLMProvider();
  if (appConfig.llm.apiKey) return new OpenAICompatibleLLMProvider();
  return new MockLLMProvider();
}

export type { LLMProvider } from "./types";
export { MockLLMProvider } from "./mock";
export { OpenAICompatibleLLMProvider } from "./openai-compatible";
