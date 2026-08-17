import type { LLMProvider } from "./types";
import { MockLLMProvider } from "./mock";
import {
  OpenAICompatibleLLMProvider,
  createOpenAICompatibleFromSettings,
} from "./openai-compatible";
import { getResolvedLlmConfig } from "../../services/llm-settings";

export function createLLMProvider(override?: "auto" | "groq" | "openai" | "gemini" | "anthropic" | "mock"): LLMProvider {
  if (override === "mock") return new MockLLMProvider();
  const cfg = getResolvedLlmConfig();
  if (cfg.provider === "mock" || !cfg.apiKey) return new MockLLMProvider();
  return createOpenAICompatibleFromSettings();
}

export type { LLMProvider } from "./types";
export { MockLLMProvider } from "./mock";
export { OpenAICompatibleLLMProvider } from "./openai-compatible";
