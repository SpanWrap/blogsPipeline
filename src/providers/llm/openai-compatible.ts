import type { z } from "zod";
import { appConfig } from "../../config";
import { getResolvedLlmConfig } from "../../services/llm-settings";
import { logger } from "../../services/logger";
import { withRetry } from "../../utils/retry";
import { formatLlmHttpError } from "./errors";
import type { LLMProvider } from "./types";

export type OpenAICompatibleOptions = {
  extraHeaders?: Record<string, string>;
  jsonMode?: boolean;
};

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
  readonly name: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly jsonMode: boolean;

  constructor(
    private readonly apiKey = appConfig.llm.apiKey,
    private readonly baseUrl = appConfig.llm.baseUrl,
    public readonly model = appConfig.llm.model,
    name?: string,
    options: OpenAICompatibleOptions = {},
  ) {
    if (!this.apiKey) {
      throw new Error("An LLM API key is required for this provider");
    }
    this.name = name ?? "openai-compatible";
    this.extraHeaders = options.extraHeaders ?? {};
    this.jsonMode = options.jsonMode ?? /groq\.com|openai\.com/i.test(this.baseUrl);
  }

  private async chat(
    messages: Array<{ role: string; content: string }>,
    options?: { json?: boolean },
  ): Promise<string> {
    return withRetry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
        try {
          const body: Record<string, unknown> = {
            model: this.model,
            temperature: 0.4,
            // Groq free-tier TPM is often 8k; reserving 8192 output tokens fails every request.
            max_tokens: this.name === "groq" ? 4096 : 8192,
            messages,
          };
          if (options?.json && this.jsonMode) {
            body.response_format = { type: "json_object" };
          }

          const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
              ...this.extraHeaders,
            },
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            const errBody = await response.text();
            const error = new Error(formatLlmHttpError(response.status, errBody, this.model)) as Error & {
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
      },
      {
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
      },
    );
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

/** Used by createLLMProvider — keeps constructor defaults in sync with runtime UI settings. */
export function createOpenAICompatibleFromSettings(): OpenAICompatibleLLMProvider {
  const cfg = getResolvedLlmConfig();
  if (!cfg.apiKey) {
    throw new Error("An LLM API key is required for this provider");
  }
  return new OpenAICompatibleLLMProvider(cfg.apiKey, cfg.baseUrl, cfg.model, cfg.provider, {
    extraHeaders: cfg.extraHeaders,
    jsonMode: cfg.jsonMode,
  });
}
