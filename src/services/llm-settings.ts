import type { Collection, Document } from "mongodb";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appConfig } from "../config";
import {
  LLM_CATALOG,
  catalogPublic,
  isLlmProviderId,
  remapRetiredModel,
  type LlmProviderId,
} from "../config/llm-catalog";
import { connectMongo, formatMongoError } from "./mongo-connection";
import { logger } from "./logger";

export type StoredLlmSettings = {
  provider: LlmProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  updatedAt: string;
};

export type ResolvedLlmConfig = {
  provider: LlmProviderId;
  model: string;
  apiKey: string | undefined;
  baseUrl: string;
  extraHeaders: Record<string, string>;
  jsonMode: boolean;
  remappedFrom?: string;
  source: "ui" | "env";
};

const SETTINGS_ID = "current";

let cache: StoredLlmSettings | null = null;
let loaded = false;
let mongoCol: Collection<Document> | null = null;

async function llmSettingsCollection(): Promise<Collection<Document> | null> {
  if (appConfig.storage.backend !== "mongodb" || !appConfig.storage.mongoUri) return null;
  if (mongoCol) return mongoCol;
  const { db } = await connectMongo(appConfig.storage.mongoUri, appConfig.storage.mongoDb);
  mongoCol = db.collection("llm_settings");
  return mongoCol;
}

function settingsFilePath() {
  return path.join(appConfig.dataDir, "llm-settings.json");
}

function envKeyFor(provider: LlmProviderId): string | undefined {
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

function providerFromEnv(): LlmProviderId {
  const raw = appConfig.llm.provider;
  if (isLlmProviderId(raw) && raw !== "mock") return raw;
  if (raw === "mock") return "mock";
  if (process.env.GROQ_API_KEY || /groq\.com/i.test(appConfig.llm.baseUrl)) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) return "anthropic";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (appConfig.llm.apiKey) return /groq\.com/i.test(appConfig.llm.baseUrl) ? "groq" : "openai";
  return "mock";
}

function sanitizeApiKey(value: string): string {
  // Strip invisible Unicode separators pasted from password managers/chats.
  return value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}

function parseStored(raw: unknown): StoredLlmSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (!isLlmProviderId(rec.provider)) return null;
  if (typeof rec.model !== "string" || !rec.model.trim()) return null;
  return {
    provider: rec.provider,
    model: rec.model.trim(),
    apiKey:
      typeof rec.apiKey === "string" && rec.apiKey.trim()
        ? sanitizeApiKey(rec.apiKey)
        : undefined,
    baseUrl: typeof rec.baseUrl === "string" && rec.baseUrl.trim() ? rec.baseUrl.trim() : undefined,
    updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : new Date().toISOString(),
  };
}

function loadFileSync(): StoredLlmSettings | null {
  try {
    const raw = JSON.parse(readFileSync(settingsFilePath(), "utf8"));
    return parseStored(raw);
  } catch {
    return null;
  }
}

async function loadMongo(): Promise<StoredLlmSettings | null> {
  try {
    const col = await llmSettingsCollection();
    if (!col) return null;
    const doc = await col.findOne({ _id: SETTINGS_ID as unknown as Document["_id"] });
    if (!doc) return null;
    const { _id: _ignored, ...rest } = doc as Record<string, unknown>;
    return parseStored(rest);
  } catch (error) {
    logger.warn("Could not load LLM settings from MongoDB", {
      error: error instanceof Error ? formatMongoError(error) : String(error),
    });
    return null;
  }
}

function writeFileSettings(settings: StoredLlmSettings) {
  mkdirSync(appConfig.dataDir, { recursive: true });
  writeFileSync(settingsFilePath(), JSON.stringify(settings, null, 2), "utf8");
}

async function writeMongoSettings(settings: StoredLlmSettings) {
  const col = await llmSettingsCollection();
  if (!col) return;
  const id = SETTINGS_ID as unknown as Document["_id"];
  await col.replaceOne({ _id: id }, { _id: id, ...settings } as Document, { upsert: true });
}

/** Overlay UI/file settings on env. Pure helper for tests. */
export function resolveLlmConfig(stored: StoredLlmSettings | null): ResolvedLlmConfig {
  const source: "ui" | "env" = stored ? "ui" : "env";
  const provider = stored?.provider ?? providerFromEnv();
  const info = LLM_CATALOG[provider];
  const requested = stored?.model || appConfig.llm.model || info.defaultModel;
  const { model, remappedFrom } = remapRetiredModel(requested);
  const apiKey =
    provider === "mock" ? undefined : stored?.apiKey || envKeyFor(provider) || appConfig.llm.apiKey;
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

function normalizeResolved(cfg: ResolvedLlmConfig): ResolvedLlmConfig {
  if (cfg.provider !== "mock" && !cfg.apiKey) {
    return { ...cfg, provider: "mock", model: "mock-1", apiKey: undefined };
  }
  return cfg;
}

export async function ensureLlmSettings(): Promise<void> {
  if (loaded) return;
  const fromMongo = await loadMongo();
  cache = fromMongo ?? loadFileSync();
  loaded = true;
}

export function getResolvedLlmConfig(): ResolvedLlmConfig {
  if (!loaded && cache === null) {
    cache = loadFileSync();
  }
  return normalizeResolved(resolveLlmConfig(cache));
}

export function maskApiKey(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
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

export async function saveLlmSettings(input: {
  provider: unknown;
  model?: unknown;
  apiKey?: unknown;
  baseUrl?: unknown;
}): Promise<ResolvedLlmConfig> {
  if (!isLlmProviderId(input.provider)) {
    throw new Error("Unknown LLM provider");
  }
  const info = LLM_CATALOG[input.provider];
  const requested =
    typeof input.model === "string" && input.model.trim() ? input.model.trim() : info.defaultModel;
  const { model } = remapRetiredModel(requested);
  const incomingKey = typeof input.apiKey === "string" ? sanitizeApiKey(input.apiKey) : "";
  const previous = cache ?? loadFileSync();
  const apiKey =
    input.provider === "mock"
      ? undefined
      : incomingKey || previous?.apiKey || envKeyFor(input.provider) || appConfig.llm.apiKey;
  if (input.provider !== "mock" && !apiKey) {
    throw new Error(`Paste a ${info.keyLabel} to use ${info.label}`);
  }
  const baseUrl =
    typeof input.baseUrl === "string" && input.baseUrl.trim() ? input.baseUrl.trim() : info.baseUrl;
  const stored: StoredLlmSettings = {
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
  } catch (error) {
    logger.warn("Could not persist LLM settings to disk", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    await writeMongoSettings(stored);
  } catch (error) {
    logger.warn("Could not persist LLM settings to MongoDB", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return getResolvedLlmConfig();
}

/** Test helper */
export function resetLlmSettingsCache(stored: StoredLlmSettings | null = null) {
  cache = stored;
  loaded = true;
}
