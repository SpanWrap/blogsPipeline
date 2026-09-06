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
const onVercel = Boolean(process.env.VERCEL);

function resolveStorageBackend(): "file" | "mongodb" | "s3" {
  const raw = (env("STORAGE_BACKEND", onVercel ? "mongodb" : "file") || "file").toLowerCase();
  if (raw === "s3") return "s3";
  if (raw === "mongodb") return "mongodb";
  if (onVercel && raw === "file") {
    // Ephemeral disk on Vercel — prefer mongodb unless S3 was requested above.
    return "mongodb";
  }
  return "file";
}

function resolveS3Region(): string {
  const raw = (env("AWS_REGION") ?? env("AWS_S3_REGION") ?? "eu-north-1")!.trim();
  return raw.replace(/\.$/, "") || "eu-north-1";
}

/** Public origin for absolute image URLs when publishing to Spanwrap / Medium / etc. */
function resolvePipelinePublicUrl(): string {
  const explicit =
    env("PIPELINE_PUBLIC_URL") ?? env("AUTH_URL") ?? env("NEXTAUTH_URL") ?? env("NEXT_PUBLIC_APP_URL");
  if (explicit?.trim()) return explicit.trim().replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    return `https://${host}`;
  }
  // Production default so publish payloads never ship relative /api/runs/... paths.
  return "https://pipeline.spanwrap.com";
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
  storage: {
    /** file (default locally), mongodb, or s3. On Vercel, `file` is coerced to mongodb. */
    backend: resolveStorageBackend(),
    mongoUri: rawMongoUri ? normalizeMongoUri(rawMongoUri) : undefined,
    mongoDb: env("MONGODB_DB", "spanwrap_pipeline")!,
    mongoCollection: env("MONGODB_COLLECTION", "pipeline_runs")!,
    s3: {
      bucket: env("AWS_S3_BUCKET") ?? env("S3_BUCKET"),
      region: resolveS3Region(),
      accessKeyId: env("AWS_ACCESS_KEY_ID") ?? env("AWS_ACCESS_KEY"),
      secretAccessKey: env("AWS_SECRET_ACCESS_KEY") ?? env("AWS_SECRET_KEY") ?? env("AWS_SECRET"),
      /** Optional key prefix inside the bucket (no leading/trailing slash). */
      prefix: (env("AWS_S3_PREFIX", "pipeline") || "pipeline").replace(/^\/+|\/+$/g, ""),
      /** Optional custom endpoint (MinIO, LocalStack). */
      endpoint: env("AWS_S3_ENDPOINT"),
      /**
       * Optional public CDN/base for objects (no trailing slash), e.g.
       * https://pipeline-spanwrap.s3.eu-north-1.amazonaws.com/pipeline
       * or a CloudFront origin. When set, publish uses S3 URLs instead of /api/runs/...
       */
      publicBaseUrl: (env("AWS_S3_PUBLIC_BASE_URL") ?? "").replace(/\/+$/, "") || null,
    },
  },
  /**
   * Absolute origin of this pipeline deployment (no trailing slash).
   * Used to turn `/api/runs/.../images/...` into publicly fetchable URLs on publish.
   */
  publicUrl: resolvePipelinePublicUrl(),
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
    digestRedditSubreddits: (
      env(
        "TRENDS_DIGEST_REDDIT_SUBREDDITS",
        "artificial,MachineLearning,LocalLLaMA,OpenAI,ChatGPT,LanguageTechnology",
      ) || "artificial,MachineLearning"
    )
      .split(",")
      .map((s) => s.trim().replace(/^r\//, ""))
      .filter(Boolean),
    githubTopics: (
      env("TRENDS_GITHUB_TOPICS", "ai,machine-learning,llm,generative-ai,deep-learning") ||
      "ai,machine-learning"
    )
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    githubToken: env("GITHUB_TOKEN") ?? env("GH_TOKEN"),
    githubSource: ((): "search" | "trending" | "both" => {
      const raw = (env("TRENDS_GITHUB_SOURCE", "trending") || "trending").toLowerCase();
      if (raw === "search" || raw === "both") return raw;
      return "trending";
    })(),
    githubDays: envInt("TRENDS_GITHUB_DAYS", 7),
    githubLanguage: env("TRENDS_GITHUB_LANGUAGE"),
    redditClientId: env("REDDIT_CLIENT_ID"),
    redditClientSecret: env("REDDIT_CLIENT_SECRET") ?? env("REDDIT_SECRET"),
    xBearerToken: env("X_BEARER_TOKEN") ?? env("TWITTER_BEARER_TOKEN"),
    digestLimit: envInt("TRENDS_DIGEST_LIMIT", 8),
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
     * auto | groq | openai | gemini | anthropic | mock
     * auto uses Groq when GROQ_API_KEY / LLM_API_KEY is set.
     */
    provider: env("LLM_PROVIDER", "auto") as
      | "auto"
      | "groq"
      | "openai"
      | "gemini"
      | "anthropic"
      | "deepseek"
      | "mock",
    apiKey:
      env("GROQ_API_KEY") ??
      env("LLM_API_KEY") ??
      env("OPENAI_API_KEY") ??
      env("GEMINI_API_KEY") ??
      env("GOOGLE_API_KEY") ??
      env("ANTHROPIC_API_KEY") ??
      env("CLAUDE_API_KEY") ??
      env("DEEPSEEK_API_KEY"),
    baseUrl: env("LLM_BASE_URL", "https://api.groq.com/openai/v1")!,
    /** Groq retired llama-3.3-70b-versatile on 2026-08-16; gpt-oss-20b is the free production replacement. */
    model: env("LLM_MODEL", "openai/gpt-oss-20b")!,
    /** Prompt compaction — keep LLM input small without dropping research usefulness. */
    promptMaxSources: envInt("LLM_PROMPT_MAX_SOURCES", 6),
    promptAnalysisSourceChars: envInt("LLM_PROMPT_ANALYSIS_SOURCE_CHARS", 2200),
    promptGenerationSourceChars: envInt("LLM_PROMPT_GENERATION_SOURCE_CHARS", 2000),
    promptMaxClaims: envInt("LLM_PROMPT_MAX_CLAIMS", 22),
    promptMaxClaimChars: envInt("LLM_PROMPT_MAX_CLAIM_CHARS", 200),
    promptMaxTemplateChars: envInt("LLM_PROMPT_MAX_TEMPLATE_CHARS", 2500),
    promptMaxKeyPoints: envInt("LLM_PROMPT_MAX_KEY_POINTS", 6),
    /** Chat completions abort after this. Reasoning models need more than REQUEST_TIMEOUT_MS. */
    requestTimeoutMs: envInt("LLM_REQUEST_TIMEOUT_MS", 180_000),
  },
  images: {
    provider: env("IMAGE_PROVIDER", "auto") as "auto" | "gemini" | "mock",
    geminiApiKey: env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY"),
    outputDir: env("IMAGE_OUTPUT_DIR", ".data/images")!,
    maxSectionImages: envInt("IMAGE_MAX_SECTION_IMAGES", 3),
  },
  spanwrap: {
    apiUrl: env("SPANWRAP_API_URL", "http://localhost:4000")!,
    apiKey: env("SPANWRAP_API_KEY"),
    blogsPath: env("SPANWRAP_BLOGS_PATH", "/api/blogs")!,
  },
  seo: {
    targetKeywordDensity: envInt("SEO_KEYWORD_DENSITY_PCT", 2) / 100,
    minTitleLength: envInt("SEO_MIN_TITLE_LENGTH", 50),
    maxTitleLength: envInt("SEO_MAX_TITLE_LENGTH", 60),
    minDescLength: envInt("SEO_MIN_DESC_LENGTH", 150),
    maxDescLength: envInt("SEO_MAX_DESC_LENGTH", 160),
  },
  social: {
    blogBaseUrl: env("BLOG_BASE_URL", "https://spanwrap.com/blog")!,
    xApiKey: env("X_API_KEY"),
    xApiSecret: env("X_API_SECRET"),
    xAccessToken: env("X_ACCESS_TOKEN"),
    xAccessSecret: env("X_ACCESS_SECRET"),
    linkedinAccessToken: env("LINKEDIN_ACCESS_TOKEN"),
    redditClientId: env("REDDIT_CLIENT_ID"),
    redditClientSecret: env("REDDIT_CLIENT_SECRET"),
    redditUsername: env("REDDIT_USERNAME"),
    redditPassword: env("REDDIT_PASSWORD"),
    autoPromote: envBool("AUTO_PROMOTE_AFTER_PUBLISH", false),
  },
  analytics: {
    dataDir: env("ANALYTICS_DATA_DIR", ".data/analytics")!,
    updateIntervalMinutes: envInt("ANALYTICS_UPDATE_INTERVAL_MINUTES", 360),
  },
  quality: {
    /** Auto-approve into REVIEW_REQUIRED skip? When score >= threshold and no errors, auto-accept stream drafts. */
    autoAcceptMinScore: envInt("AUTO_ACCEPT_MIN_SCORE", 80),
    autoAcceptEnabled: envBool("AUTO_ACCEPT_ENABLED", false),
  },
  publishing: {
    medium: {
      token: env("MEDIUM_TOKEN"),
      canonicalBase: env("MEDIUM_CANONICAL_BASE"),
    },
    devto: {
      apiKey: env("DEVTO_API_KEY"),
      canonicalBase: env("DEVTO_CANONICAL_BASE"),
    },
    hashnode: {
      token: env("HASHNODE_TOKEN"),
      publicationId: env("HASHNODE_PUBLICATION_ID"),
      canonicalBase: env("HASHNODE_CANONICAL_BASE"),
    },
    wordpress: {
      url: env("WORDPRESS_URL"),
      user: env("WORDPRESS_USER"),
      appPassword: env("WORDPRESS_APP_PASSWORD"),
    },
    substack: {
      draftsDir: env("SUBSTACK_DRAFTS_DIR", ".data/substack-drafts")!,
    },
  },
  retry: {
    maxAttempts: envInt("RETRY_MAX_ATTEMPTS", 3),
    baseDelayMs: envInt("RETRY_BASE_DELAY_MS", 500),
  },
  autopilot: {
    /** Master switch — set AUTOPILOT_ENABLED=true + configure API keys. */
    enabled: envBool("AUTOPILOT_ENABLED", false),
    /** 5-field cron expression. Default: every Monday at 08:00 UTC. */
    cronExpression: env("AUTOPILOT_CRON", "0 8 * * 1")!,
    /** Number of unique posts to generate per platform per cycle. */
    postsPerPlatform: envInt("AUTOPILOT_POSTS_PER_PLATFORM", 2),
    /** Comma-separated platform list. */
    targetPlatforms: (
      env("AUTOPILOT_PLATFORMS", "spanwrap,medium,devto,hashnode,wordpress,substack") || "spanwrap"
    )
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    /** When true, auto-approve + publish posts that pass quality threshold. */
    skipReview: envBool("AUTOPILOT_SKIP_REVIEW", false),
    /** Minimum quality score to auto-approve (only used when skipReview is true). */
    minQualityScore: envInt("AUTOPILOT_MIN_QUALITY_SCORE", 75),
    /** Prevent re-covering topics published within this window. */
    topicDeduplicationDays: envInt("AUTOPILOT_DEDUP_DAYS", 30),
    /** Generate hero/section images during autopilot cycles. */
    generateImages: envBool("AUTOPILOT_GENERATE_IMAGES", true),
    /** Pin a specific template for autopilot runs. */
    templateId: env("AUTOPILOT_TEMPLATE_ID"),
    /** Generate drafts but skip publishing (testing). */
    dryRun: envBool("AUTOPILOT_DRY_RUN", false),
  },
  auth: {
    /** Optional bootstrap account created on first boot if no users exist. */
    username: env("AUTH_USERNAME"),
    password: env("AUTH_PASSWORD"),
    /** HMAC secret for session cookies. Generated into .data/auth-secret when unset locally. */
    secret: env("AUTH_SECRET"),
    sessionDays: envInt("AUTH_SESSION_DAYS", 7),
  },
} as const;

export type AppConfig = typeof appConfig;
