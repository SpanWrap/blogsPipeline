import { appConfig } from "../../config";
import { getResolvedLlmConfig } from "../../services/llm-settings";
import { logger } from "../../services/logger";
import { isTransientError, withRetry } from "../../utils/retry";
import { formatLlmHttpError } from "./errors";
function sanitizeHeaderValue(value) {
    // Remove invisible copy/paste artifacts that break fetch ByteString conversion.
    return (value ?? "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}
function extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() ?? text.trim();
    try {
        return JSON.parse(candidate);
    }
    catch {
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");
        if (start >= 0 && end > start) {
            return JSON.parse(candidate.slice(start, end + 1));
        }
        throw new Error("LLM response did not contain valid JSON");
    }
}
export class OpenAICompatibleLLMProvider {
    apiKey;
    baseUrl;
    model;
    name;
    extraHeaders;
    jsonMode;
    constructor(apiKey = appConfig.llm.apiKey, baseUrl = appConfig.llm.baseUrl, model = appConfig.llm.model, name, options = {}) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.model = model;
        if (!this.apiKey) {
            throw new Error("An LLM API key is required for this provider");
        }
        this.name = name ?? "openai-compatible";
        this.extraHeaders = options.extraHeaders ?? {};
        this.jsonMode = options.jsonMode ?? /groq\.com|openai\.com/i.test(this.baseUrl);
    }
    async chat(messages, options) {
        return withRetry(async () => {
            const controller = new AbortController();
            const reasoningModel = /reasoner|r1/i.test(this.model);
            const timeoutMs = reasoningModel
                ? Math.max(appConfig.llm.requestTimeoutMs, 240_000)
                : appConfig.llm.requestTimeoutMs;
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const body = {
                    model: this.model,
                    max_tokens: reasoningModel ? 16384 : this.name === "groq" ? 4096 : 8192,
                    messages,
                };
                if (!reasoningModel) {
                    body.temperature = 0.4;
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
                    const error = new Error(formatLlmHttpError(response.status, errBody, this.model));
                    error.status = response.status;
                    throw error;
                }
                const data = (await response.json());
                const content = data.choices?.[0]?.message?.content;
                if (!content)
                    throw new Error("Empty LLM response");
                return content;
            }
            catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                    throw new Error(`LLM request timed out after ${Math.round(timeoutMs / 1000)}s (${this.name}/${this.model}). Use deepseek-chat for drafting, or raise LLM_REQUEST_TIMEOUT_MS.`);
                }
                throw error;
            }
            finally {
                clearTimeout(timer);
            }
        }, {
            maxAttempts: appConfig.retry.maxAttempts,
            baseDelayMs: appConfig.retry.baseDelayMs,
            shouldRetry: (error) => {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes("LLM request timed out"))
                    return false;
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
        });
    }
    async generateText(prompt) {
        return this.chat([{ role: "user", content: prompt }]);
    }
    async generateStructured(prompt, schema, options) {
        const system = options?.system ??
            "You are a careful research assistant. Respond with valid JSON only matching the requested schema. Never invent source IDs or URLs.";
        const text = await this.chat([
            { role: "system", content: system },
            {
                role: "user",
                content: `${prompt}\n\nReturn ONLY valid JSON (a single JSON object).`,
            },
        ], { json: true });
        const parsed = extractJson(text);
        return schema.parse(parsed);
    }
}
/** Used by createLLMProvider — keeps constructor defaults in sync with runtime UI settings. */
export function createOpenAICompatibleFromSettings() {
    const cfg = getResolvedLlmConfig();
    if (!cfg.apiKey) {
        throw new Error("An LLM API key is required for this provider");
    }
    return new OpenAICompatibleLLMProvider(cfg.apiKey, cfg.baseUrl, cfg.model, cfg.provider, {
        extraHeaders: cfg.extraHeaders,
        jsonMode: cfg.jsonMode,
    });
}
