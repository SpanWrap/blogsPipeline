import { appConfig } from "../../config";
import type { LLMProvider } from "./types";
import { MockLLMProvider } from "./mock";
import { OpenAICompatibleLLMProvider } from "./openai-compatible";

export function createLLMProvider(
  override?: "auto" | "groq" | "openai" | "mock",
): LLMProvider {
  const mode = override ?? appConfig.llm.provider;

  if (mode === "mock") return new MockLLMProvider();

  if (mode === "groq" || mode === "openai") {
    return new OpenAICompatibleLLMProvider(
      appConfig.llm.apiKey,
      appConfig.llm.baseUrl,
      appConfig.llm.model,
      mode === "groq" ? "groq" : "openai-compatible",
    );
  }

  // auto
  if (appConfig.llm.apiKey) {
    const isGroq =
      /groq\.com/i.test(appConfig.llm.baseUrl) || Boolean(process.env.GROQ_API_KEY);
    return new OpenAICompatibleLLMProvider(
      appConfig.llm.apiKey,
      appConfig.llm.baseUrl,
      appConfig.llm.model,
      isGroq ? "groq" : "openai-compatible",
    );
  }

  return new MockLLMProvider();
}

export type { LLMProvider } from "./types";
export { MockLLMProvider } from "./mock";
export { OpenAICompatibleLLMProvider } from "./openai-compatible";
