import { config as loadDotenv } from "dotenv";
import path from "node:path";

// Vercel injects env vars into process.env; skip .env file noise in production logs.
if (!process.env.VERCEL) {
  loadDotenv({ quiet: true });
}

function env(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function resolveDataDir(): string {
  const raw = env("PIPELINE_DATA_DIR", ".data")!;
  // Scope under cwd so bundlers do not NFT the whole project tree.
  return path.isAbsolute(raw)
    ? raw
    : path.join(/* turbopackIgnore: true */ process.cwd(), raw);
}

function normalizeMongoUri(uri: string): string {
  const trimmed = uri.trim();
  const match = trimmed.match(/^(mongodb(?:\+srv)?:\/\/)([^/?#]+)(@)(.+)$/i);
  if (!match) return trimmed;
  const [, scheme, userInfo, at, hostAndRest] = match;
  const colon = userInfo!.indexOf(":");
  if (colon < 0) return trimmed;
  const username = userInfo!.slice(0, colon);
  const password = userInfo!.slice(colon + 1);
  if (!username || !password) return trimmed;
  let userDecoded = username;
  let passDecoded = password;
  try {
    userDecoded = decodeURIComponent(username);
    passDecoded = decodeURIComponent(password);
  } catch {
    // keep raw
  }
  return `${scheme}${encodeURIComponent(userDecoded)}:${encodeURIComponent(passDecoded)}${at}${hostAndRest}`;
}

const rawMongoUri = env("MONGODB_URI");

export const appConfig = {
  dataDir: resolveDataDir(),
  requestTimeoutMs: envInt("REQUEST_TIMEOUT_MS", 30_000),
  maxSources: envInt("MAX_SOURCES", 8),
  maxFetchConcurrency: envInt("MAX_FETCH_CONCURRENCY", 2),
  userAgent:
    env(
      "PIPELINE_USER_AGENT",
      "SpanwrapBlogPipeline/1.0 (+https://spanwrap.com; research bot; contact: pipeline)",
    )!,
  respectRobotsTxt: envBool("RESPECT_ROBOTS_TXT", true),
  storage: {
    /** file (default) or mongodb */
    backend: (env("STORAGE_BACKEND", "file") === "mongodb" ? "mongodb" : "file") as
      | "file"
      | "mongodb",
    mongoUri: rawMongoUri ? normalizeMongoUri(rawMongoUri) : undefined,
    mongoDb: env("MONGODB_DB", "spanwrap_pipeline")!,
    mongoCollection: env("MONGODB_COLLECTION", "pipeline_runs")!,
  },
  ui: {
    host: env("UI_HOST", process.env.VERCEL ? "0.0.0.0" : "127.0.0.1")!,
    /** Vercel sets PORT; locally UI_PORT (default 8787) is used. */
    port: envInt("PORT", envInt("UI_PORT", 8787)),
  },
  trends: {
    /** comma list: hackernews,reddit,devto,mock */
    sources: (env("TRENDS_SOURCES", "hackernews,reddit") || "hackernews,reddit")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    redditSubreddits: (
      env(
        "TRENDS_REDDIT_SUBREDDITS",
        "technology,programming,MachineLearning,startups,saas,artificial",
      ) || "technology,programming"
    )
      .split(",")
      .map((s) => s.trim().replace(/^r\//, ""))
      .filter(Boolean),
    limit: envInt("TRENDS_LIMIT", 12),
    cacheTtlMinutes: envInt("TRENDS_CACHE_TTL_MINUTES", 60),
  },
  research: {
    provider: env("RESEARCH_PROVIDER", "auto") as
      | "auto"
      | "serper"
      | "tavily"
      | "mock",
    serperApiKey: env("SERPER_API_KEY"),
    tavilyApiKey: env("TAVILY_API_KEY"),
  },
  llm: {
    /**
     * auto | groq | openai | mock
     * auto uses Groq when GROQ_API_KEY / LLM_API_KEY is set.
     */
    provider: env("LLM_PROVIDER", "auto") as "auto" | "groq" | "openai" | "mock",
    apiKey:
      env("GROQ_API_KEY") ?? env("LLM_API_KEY") ?? env("OPENAI_API_KEY"),
    baseUrl: env("LLM_BASE_URL", "https://api.groq.com/openai/v1")!,
    /** Good default on Groq for structured blog generation */
    model: env("LLM_MODEL", "llama-3.3-70b-versatile")!,
  },
  spanwrap: {
    apiUrl: env("SPANWRAP_API_URL", "http://localhost:4000")!,
    apiKey: env("SPANWRAP_API_KEY"),
    blogsPath: env("SPANWRAP_BLOGS_PATH", "/api/blogs")!,
  },
  retry: {
    maxAttempts: envInt("RETRY_MAX_ATTEMPTS", 3),
    baseDelayMs: envInt("RETRY_BASE_DELAY_MS", 500),
  },
} as const;

export type AppConfig = typeof appConfig;
