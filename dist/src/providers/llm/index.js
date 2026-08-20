import { MockLLMProvider } from "./mock";
import { createOpenAICompatibleFromSettings, } from "./openai-compatible";
import { getResolvedLlmConfig } from "../../services/llm-settings";
export function createLLMProvider(override) {
    if (override === "mock")
        return new MockLLMProvider();
    const cfg = getResolvedLlmConfig();
    if (cfg.provider === "mock" || !cfg.apiKey)
        return new MockLLMProvider();
    return createOpenAICompatibleFromSettings();
}
export { MockLLMProvider } from "./mock";
export { OpenAICompatibleLLMProvider } from "./openai-compatible";
