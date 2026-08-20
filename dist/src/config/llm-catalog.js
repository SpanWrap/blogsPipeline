export const LLM_PROVIDER_IDS = ["groq", "openai", "gemini", "anthropic", "deepseek", "mock"];
/** Groq retired these IDs; map them to a current free production model. */
export const RETIRED_LLM_MODELS = {
    "llama-3.3-70b-versatile": "openai/gpt-oss-20b",
    "llama-3.3-70b-specdec": "openai/gpt-oss-20b",
    "llama-3.1-8b-instant": "openai/gpt-oss-20b",
    "llama-3.1-70b-versatile": "openai/gpt-oss-20b",
    "llama-3.1-70b-specdec": "openai/gpt-oss-20b",
};
/** Current Groq production model on the free/developer plan (Llama 3.3 70B replacement). */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
export const LLM_CATALOG = {
    groq: {
        id: "groq",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        defaultModel: DEFAULT_GROQ_MODEL,
        models: [
            { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B (free, fast)" },
            { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (higher quality, 8k TPM on free tier)" },
            { id: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B" },
        ],
        keyLabel: "Groq API key",
        keyUrl: "https://console.groq.com/keys",
        extraHeaders: {},
        jsonMode: true,
    },
    openai: {
        id: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        models: [
            { id: "gpt-4o-mini", label: "GPT-4o mini" },
            { id: "gpt-4o", label: "GPT-4o" },
            { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
        ],
        keyLabel: "OpenAI API key",
        keyUrl: "https://platform.openai.com/api-keys",
        extraHeaders: {},
        jsonMode: true,
    },
    gemini: {
        id: "gemini",
        label: "Gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        defaultModel: "gemini-2.5-flash",
        models: [
            { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
            { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
            { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
        ],
        keyLabel: "Gemini API key",
        keyUrl: "https://aistudio.google.com/apikey",
        extraHeaders: {},
        jsonMode: true,
    },
    anthropic: {
        id: "anthropic",
        label: "Claude",
        baseUrl: "https://api.anthropic.com/v1",
        defaultModel: "claude-sonnet-4-0",
        models: [
            { id: "claude-sonnet-4-0", label: "Claude Sonnet 4" },
            { id: "claude-3-5-haiku-latest", label: "Claude Haiku 3.5" },
            { id: "claude-3-5-sonnet-latest", label: "Claude Sonnet 3.5" },
        ],
        keyLabel: "Anthropic API key",
        keyUrl: "https://console.anthropic.com/settings/keys",
        extraHeaders: { "anthropic-version": "2023-06-01" },
        jsonMode: false,
    },
    deepseek: {
        id: "deepseek",
        label: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        defaultModel: "deepseek-chat",
        models: [
            { id: "deepseek-chat", label: "DeepSeek V3" },
            { id: "deepseek-reasoner", label: "DeepSeek R1" },
        ],
        keyLabel: "DeepSeek API key",
        keyUrl: "https://platform.deepseek.com/api_keys",
        extraHeaders: {},
        jsonMode: true,
    },
    mock: {
        id: "mock",
        label: "Mock (no API)",
        baseUrl: "",
        defaultModel: "mock-1",
        models: [{ id: "mock-1", label: "Mock" }],
        keyLabel: "No key needed",
        keyUrl: "",
        extraHeaders: {},
        jsonMode: false,
    },
};
export function isLlmProviderId(value) {
    return typeof value === "string" && LLM_PROVIDER_IDS.includes(value);
}
export function remapRetiredModel(model) {
    const next = RETIRED_LLM_MODELS[model];
    if (!next)
        return { model };
    return { model: next, remappedFrom: model };
}
export function catalogPublic() {
    return LLM_PROVIDER_IDS.map((id) => {
        const p = LLM_CATALOG[id];
        return {
            id: p.id,
            label: p.label,
            defaultModel: p.defaultModel,
            models: p.models,
            keyLabel: p.keyLabel,
            keyUrl: p.keyUrl,
        };
    });
}
