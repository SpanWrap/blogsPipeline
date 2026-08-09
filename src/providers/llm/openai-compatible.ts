import type { z } from "zod";
import { appConfig } from "@/config";
import { logger } from "@/services/logger";
import { withRetry } from "@/utils/retry";
import type { LLMProvider } from "./types";

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("LLM response did not contain valid JSON");
  }
}

export class OpenAICompatibleLLMProvider implements LLMProvider {
  readonly name = "openai-compatible";

  constructor(
    private readonly apiKey = appConfig.llm.apiKey,
    private readonly baseUrl = appConfig.llm.baseUrl,
    public readonly model = appConfig.llm.model,
  ) {
    if (!this.apiKey) {
      throw new Error("LLM_API_KEY or OPENAI_API_KEY is required for OpenAI-compatible provider");
    }
  }

  private async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    return withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
      try {
        const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0.4,
            messages,
          }),
        });
        if (!response.ok) {
          const body = await response.text();
          const error = new Error(`LLM HTTP ${response.status}: ${body.slice(0, 200)}`) as Error & {
            status: number;
          };
          error.status = response.status;
          throw error;
        }
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("Empty LLM response");
        return content;
      } finally {
        clearTimeout(timer);
      }
    }, {
      maxAttempts: appConfig.retry.maxAttempts,
      baseDelayMs: appConfig.retry.baseDelayMs,
      onRetry: (error, attempt, delayMs) => {
        logger.warn("Retrying LLM request", {
          attempt,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
  }

  async generateText(prompt: string): Promise<string> {
    return this.chat([{ role: "user", content: prompt }]);
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: { system?: string },
  ): Promise<T> {
    const system =
      options?.system ??
      "You are a careful research assistant. Respond with valid JSON only matching the requested schema. Never invent source IDs or URLs.";
    const text = await this.chat([
      { role: "system", content: system },
      {
        role: "user",
        content: `${prompt}\n\nReturn ONLY valid JSON.`,
      },
    ]);
    const parsed = extractJson(text);
    return schema.parse(parsed);
  }
}
