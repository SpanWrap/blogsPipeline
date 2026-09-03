import { getResolvedLlmConfig } from "../../services/llm-settings";
import { OpenAICompatibleLLMProvider } from "./openai-compatible";
import type { LLMProvider } from "./types";

/**
 * Prefer a low-latency model for Quick Edit / selection rewrite.
 * Uses Groq when GROQ_API_KEY is set (often 1–3s). Otherwise remaps
 * reasoner/R1 → deepseek-chat. Set LLM_QUICK_EDIT_FAST=false to disable.
 */
export function createQuickEditLLM(fallback: LLMProvider): LLMProvider {
  if (process.env.LLM_QUICK_EDIT_FAST === "false") return fallback;

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const model = process.env.LLM_QUICK_EDIT_MODEL?.trim() || "llama-3.1-8b-instant";
    try {
      return new OpenAICompatibleLLMProvider(
        groqKey,
        process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
        model,
        "groq",
      );
    } catch {
      /* fall through */
    }
  }

  if (/reasoner|r1/i.test(fallback.model)) {
    const cfg = getResolvedLlmConfig();
    if (cfg.apiKey && (cfg.provider === "deepseek" || /deepseek/i.test(cfg.baseUrl))) {
      try {
        return new OpenAICompatibleLLMProvider(
          cfg.apiKey,
          cfg.baseUrl || "https://api.deepseek.com/v1",
          "deepseek-chat",
          "deepseek",
        );
      } catch {
        /* fall through */
      }
    }
  }

  return fallback;
}
