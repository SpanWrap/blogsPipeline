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

function isGroqBaseUrl(baseUrl: string): boolean {
  return /groq\.com/i.test(baseUrl);
}

export class OpenAICompatibleLLMProvider implements LLMProvider {
  readonly name: string;

  constructor(
    private readonly apiKey = appConfig.llm.apiKey,
    private readonly baseUrl = appConfig.llm.baseUrl,
    public readonly model = appConfig.llm.model,
    name?: string,
  ) {
    if (!this.apiKey) {
      throw new Error(
        "GROQ_API_KEY, LLM_API_KEY, or OPENAI_API_KEY is required for the LLM provider",
      );
    }
    this.name =
      name ??
      (isGroqBaseUrl(this.baseUrl) || appConfig.llm.provider === "groq"
        ? "groq"
        : "openai-compatible");
  }

  private async chat(
    messages: Array<{ role: string; content: string }>,
    options?: { json?: boolean },
  ): Promise<string> {
    return withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
      try {
        // Groq supports OpenAI-compatible JSON mode; use it for structured stages.
        const useJsonMode =
          options?.json &&
          (isGroqBaseUrl(this.baseUrl) || appConfig.llm.provider === "groq");

        const body: Record<string, unknown> = {
          model: this.model,
          temperature: 0.4,
          messages,
        };
        if (useJsonMode) {
          body.response_format = { type: "json_object" };
        }

        const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const errBody = await response.text();
          const error = new Error(
            `LLM HTTP ${response.status}: ${errBody.slice(0, 300)}`,
          ) as Error & { status: number };
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
          provider: this.name,
          model: this.model,
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
    const text = await this.chat(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `${prompt}\n\nReturn ONLY valid JSON (a single JSON object).`,
        },
      ],
      { json: true },
    );
    const parsed = extractJson(text);
    return schema.parse(parsed);
  }
}
