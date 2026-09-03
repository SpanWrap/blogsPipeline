import type { z } from "zod";
import { appConfig } from "../../config";
import { getResolvedLlmConfig } from "../../services/llm-settings";
import { logger } from "../../services/logger";
import { isTransientError, withRetry } from "../../utils/retry";
import { formatLlmHttpError } from "./errors";
import type { GenerateTextOptions, LLMProvider } from "./types";

export type OpenAICompatibleOptions = {
  extraHeaders?: Record<string, string>;
  jsonMode?: boolean;
};

function sanitizeHeaderValue(value: string | undefined): string {
  // Remove invisible copy/paste artifacts that break fetch ByteString conversion.
  return (value ?? "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}

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
    options?: { json?: boolean } & GenerateTextOptions,
  ): Promise<string> {
    return withRetry(
      async () => {
        const controller = new AbortController();
        const reasoningModel = /reasoner|r1/i.test(this.model);
        const timeoutMs =
          options?.timeoutMs ??
          (reasoningModel
            ? Math.max(appConfig.llm.requestTimeoutMs, 240_000)
            : appConfig.llm.requestTimeoutMs);
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const maxTokens =
            options?.maxTokens ??
            (reasoningModel ? 16384 : this.name === "groq" ? 8192 : 12288);
          const body: Record<string, unknown> = {
            model: this.model,
            max_tokens: maxTokens,
            messages,
          };
          if (!reasoningModel) {
            body.temperature = options?.temperature ?? 0.4;
          }
          if (options?.json && this.jsonMode && !reasoningModel) {
            body.response_format = { type: "json_object" };
          }

          const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sanitizeHeaderValue(this.apiKey)}`,
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
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            throw new Error(
              `LLM request timed out after ${Math.round(timeoutMs / 1000)}s (${this.name}/${this.model}). Use deepseek-chat for drafting, or raise LLM_REQUEST_TIMEOUT_MS.`,
            );
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      },
      {
        maxAttempts: Math.min(2, appConfig.retry.maxAttempts),
        baseDelayMs: appConfig.retry.baseDelayMs,
        shouldRetry: (error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("LLM request timed out")) return false;
          return isTransientError(error);
        },
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

  async generateText(prompt: string, options?: GenerateTextOptions): Promise<string> {
    const messages = [
      ...(options?.system ? [{ role: "system", content: options.system }] : []),
      { role: "user", content: prompt },
    ];
    return this.chat(messages, options);
  }

  async streamText(
    prompt: string,
    onDelta: (chunk: string) => void | Promise<void>,
    options?: { system?: string; signal?: AbortSignal },
  ): Promise<string> {
    const reasoningModel = /reasoner|r1/i.test(this.model);
    const timeoutMs = reasoningModel
      ? Math.max(appConfig.llm.requestTimeoutMs, 240_000)
      : appConfig.llm.requestTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const messages = [
        ...(options?.system ? [{ role: "system", content: options.system }] : []),
        { role: "user", content: prompt },
      ];
      const body: Record<string, unknown> = {
        model: this.model,
        stream: true,
        max_tokens: reasoningModel ? 16384 : this.name === "groq" ? 8192 : 12288,
        messages,
      };
      if (!reasoningModel) body.temperature = 0.4;

      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sanitizeHeaderValue(this.apiKey)}`,
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
      if (!response.body) throw new Error("LLM stream returned no body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              await onDelta(delta);
            }
          } catch {
            /* ignore partial JSON frames */
          }
        }
      }

      if (!full.trim()) throw new Error("Empty LLM stream");
      return full;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (options?.signal?.aborted) throw new Error("Stream aborted");
        throw new Error(
          `LLM request timed out after ${Math.round(timeoutMs / 1000)}s (${this.name}/${this.model}). Use deepseek-chat for drafting, or raise LLM_REQUEST_TIMEOUT_MS.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
    }
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
