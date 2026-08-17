import { describe, expect, it } from "vitest";
import { remapRetiredModel, DEFAULT_GROQ_MODEL } from "@/config/llm-catalog";
import { resolveLlmConfig, maskApiKey, resetLlmSettingsCache } from "@/services/llm-settings";
import { formatLlmHttpError } from "@/providers/llm/errors";

describe("LLM catalog", () => {
  it("remaps retired Groq Llama models to a current free model", () => {
    const result = remapRetiredModel("llama-3.3-70b-versatile");
    expect(result.model).toBe(DEFAULT_GROQ_MODEL);
    expect(result.remappedFrom).toBe("llama-3.3-70b-versatile");
    expect(remapRetiredModel("openai/gpt-oss-20b").remappedFrom).toBeUndefined();
  });
});

describe("LLM settings resolve", () => {
  it("overlays a saved Gemini key without leaking it in the mask", () => {
    resetLlmSettingsCache({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "AIzaSyDummyKeyValue12",
      updatedAt: new Date().toISOString(),
    });
    const cfg = resolveLlmConfig({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "AIzaSyDummyKeyValue12",
      updatedAt: new Date().toISOString(),
    });
    expect(cfg.provider).toBe("gemini");
    expect(cfg.model).toBe("gemini-2.5-flash");
    expect(cfg.apiKey).toBe("AIzaSyDummyKeyValue12");
    expect(maskApiKey(cfg.apiKey)).toBe("AIza…ue12");
    expect(cfg.baseUrl).toContain("generativelanguage.googleapis.com");
  });

  it("remaps a stored retired model id", () => {
    const cfg = resolveLlmConfig({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      apiKey: "gsk_testkey_abcdefghijklmnopqrstuvwxyz",
      updatedAt: new Date().toISOString(),
    });
    expect(cfg.model).toBe("openai/gpt-oss-20b");
    expect(cfg.remappedFrom).toBe("llama-3.3-70b-versatile");
  });
});

describe("LLM HTTP errors", () => {
  it("explains Groq TPM 413 and tells the user to shorten the template", () => {
    const body = JSON.stringify({
      error: {
        message:
          "Request too large for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Requested 8991, please reduce your message size and try again. Need more tokens? Upgrade to Dev Tier today at https://example.com",
      },
    });
    const msg = formatLlmHttpError(413, body, "openai/gpt-oss-120b");
    expect(msg).toContain("Prompt too large");
    expect(msg).toContain("openai/gpt-oss-120b");
    expect(msg).toMatch(/8,?991/);
    expect(msg).toMatch(/8,?000/);
    expect(msg.toLowerCase()).toContain("template");
    expect(msg).not.toContain("org_");
    expect(msg).not.toContain("Upgrade to Dev Tier");
  });

  it("keeps a short HTTP prefix for other failures", () => {
    expect(formatLlmHttpError(401, '{"error":{"message":"Invalid API Key"}}', "gpt")).toContain(
      "LLM HTTP 401",
    );
  });
});
