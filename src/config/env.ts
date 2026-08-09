import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv();

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
    provider: env("LLM_PROVIDER", "auto") as "auto" | "openai" | "mock",
    apiKey: env("LLM_API_KEY") ?? env("OPENAI_API_KEY"),
    baseUrl: env("LLM_BASE_URL", "https://api.openai.com/v1")!,
    model: env("LLM_MODEL", "gpt-4o-mini")!,
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
