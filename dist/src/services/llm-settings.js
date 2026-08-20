import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appConfig } from "../config";
import { LLM_CATALOG, catalogPublic, isLlmProviderId, remapRetiredModel, } from "../config/llm-catalog";
import { connectMongo, formatMongoError } from "./mongo-connection";
import { logger } from "./logger";
const SETTINGS_ID = "current";
let cache = null;
let loaded = false;
let mongoCol = null;
async function llmSettingsCollection() {
    if (appConfig.storage.backend !== "mongodb" || !appConfig.storage.mongoUri)
        return null;
    if (mongoCol)
        return mongoCol;
    const { db } = await connectMongo(appConfig.storage.mongoUri, appConfig.storage.mongoDb);
    mongoCol = db.collection("llm_settings");
    return mongoCol;
}
function settingsFilePath() {
    return path.join(appConfig.dataDir, "llm-settings.json");
}
function envKeyFor(provider) {
    if (provider === "groq") {
        return process.env.GROQ_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    }
    if (provider === "openai") {
        return process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
    }
    if (provider === "gemini") {
        return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    }
    if (provider === "anthropic") {
        return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    }
    if (provider === "deepseek") {
        return process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY;
    }
    return undefined;
}
function providerFromEnv() {
    const raw = appConfig.llm.provider;
    if (isLlmProviderId(raw) && raw !== "mock")
        return raw;
    if (raw === "mock")
        return "mock";
    if (process.env.GROQ_API_KEY || /groq\.com/i.test(appConfig.llm.baseUrl))
        return "groq";
    if (process.env.OPENAI_API_KEY)
        return "openai";
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
        return "gemini";
    if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
        return "anthropic";
    if (process.env.DEEPSEEK_API_KEY)
        return "deepseek";
    if (appConfig.llm.apiKey)
        return /groq\.com/i.test(appConfig.llm.baseUrl) ? "groq" : "openai";
    return "mock";
}
function sanitizeApiKey(value) {
    // Strip invisible Unicode separators pasted from password managers/chats.
    return value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}
function parseStored(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const rec = raw;
    if (!isLlmProviderId(rec.provider))
        return null;
    if (typeof rec.model !== "string" || !rec.model.trim())
        return null;
    return {
        provider: rec.provider,
        model: rec.model.trim(),
        apiKey: typeof rec.apiKey === "string" && rec.apiKey.trim()
            ? sanitizeApiKey(rec.apiKey)
            : undefined,
        baseUrl: typeof rec.baseUrl === "string" && rec.baseUrl.trim() ? rec.baseUrl.trim() : undefined,
        updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : new Date().toISOString(),
    };
}
function loadFileSync() {
    try {
        const raw = JSON.parse(readFileSync(settingsFilePath(), "utf8"));
        return parseStored(raw);
    }
    catch {
        return null;
    }
}
async function loadMongo() {
    try {
        const col = await llmSettingsCollection();
        if (!col)
            return null;
        const doc = await col.findOne({ _id: SETTINGS_ID });
        if (!doc)
            return null;
        const { _id: _ignored, ...rest } = doc;
        return parseStored(rest);
    }
    catch (error) {
        logger.warn("Could not load LLM settings from MongoDB", {
            error: error instanceof Error ? formatMongoError(error) : String(error),
        });
        return null;
    }
}
function writeFileSettings(settings) {
    mkdirSync(appConfig.dataDir, { recursive: true });
    writeFileSync(settingsFilePath(), JSON.stringify(settings, null, 2), "utf8");
}
async function writeMongoSettings(settings) {
    const col = await llmSettingsCollection();
    if (!col)
        return;
    const id = SETTINGS_ID;
    await col.replaceOne({ _id: id }, { _id: id, ...settings }, { upsert: true });
}
/** Overlay UI/file settings on env. Pure helper for tests. */
export function resolveLlmConfig(stored) {
    const source = stored ? "ui" : "env";
    const provider = stored?.provider ?? providerFromEnv();
    const info = LLM_CATALOG[provider];
    const requested = stored?.model || appConfig.llm.model || info.defaultModel;
    const { model, remappedFrom } = remapRetiredModel(requested);
    const apiKey = provider === "mock" ? undefined : stored?.apiKey || envKeyFor(provider) || appConfig.llm.apiKey;
    const baseUrl = stored?.baseUrl || info.baseUrl || appConfig.llm.baseUrl;
    return {
        provider,
        model: provider === "mock" ? "mock-1" : model,
        apiKey: provider === "mock" ? undefined : apiKey,
        baseUrl,
        extraHeaders: info.extraHeaders,
        jsonMode: info.jsonMode,
        remappedFrom,
        source,
    };
}
function normalizeResolved(cfg) {
    if (cfg.provider !== "mock" && !cfg.apiKey) {
        return { ...cfg, provider: "mock", model: "mock-1", apiKey: undefined };
    }
    return cfg;
}
export async function ensureLlmSettings() {
    if (loaded)
        return;
    const fromMongo = await loadMongo();
    cache = fromMongo ?? loadFileSync();
    loaded = true;
}
export function getResolvedLlmConfig() {
    if (!loaded && cache === null) {
        cache = loadFileSync();
    }
    return normalizeResolved(resolveLlmConfig(cache));
}
export function maskApiKey(key) {
    if (!key)
        return null;
    if (key.length <= 8)
        return "••••";
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
export function publicLlmStatus() {
    const cfg = getResolvedLlmConfig();
    const info = LLM_CATALOG[cfg.provider];
    return {
        provider: cfg.provider,
        model: cfg.model,
        remappedFrom: cfg.remappedFrom ?? null,
        hasKey: Boolean(cfg.apiKey),
        keyPreview: maskApiKey(cfg.apiKey),
        source: cfg.source,
        keyLabel: info.keyLabel,
        keyUrl: info.keyUrl,
        providers: catalogPublic(),
    };
}
export async function saveLlmSettings(input) {
    if (!isLlmProviderId(input.provider)) {
        throw new Error("Unknown LLM provider");
    }
    const info = LLM_CATALOG[input.provider];
    const requested = typeof input.model === "string" && input.model.trim() ? input.model.trim() : info.defaultModel;
    const { model } = remapRetiredModel(requested);
    const incomingKey = typeof input.apiKey === "string" ? sanitizeApiKey(input.apiKey) : "";
    const previous = cache ?? loadFileSync();
    const apiKey = input.provider === "mock"
        ? undefined
        : incomingKey || previous?.apiKey || envKeyFor(input.provider) || appConfig.llm.apiKey;
    if (input.provider !== "mock" && !apiKey) {
        throw new Error(`Paste a ${info.keyLabel} to use ${info.label}`);
    }
    const baseUrl = typeof input.baseUrl === "string" && input.baseUrl.trim() ? input.baseUrl.trim() : info.baseUrl;
    const stored = {
        provider: input.provider,
        model,
        apiKey,
        baseUrl: baseUrl || undefined,
        updatedAt: new Date().toISOString(),
    };
    cache = stored;
    loaded = true;
    try {
        writeFileSettings(stored);
    }
    catch (error) {
        logger.warn("Could not persist LLM settings to disk", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    try {
        await writeMongoSettings(stored);
    }
    catch (error) {
        logger.warn("Could not persist LLM settings to MongoDB", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return getResolvedLlmConfig();
}
/** Test helper */
export function resetLlmSettingsCache(stored = null) {
    cache = stored;
    loaded = true;
}
