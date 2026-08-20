var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/config/env.ts
import { config as loadDotenv } from "dotenv";
import path from "node:path";
function env(name, fallback) {
  const value = process.env[name];
  if (value === void 0 || value === "") return fallback;
  return value;
}
function envBool(name, fallback) {
  const value = process.env[name];
  if (value === void 0 || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function envInt(name, fallback) {
  const value = process.env[name];
  if (value === void 0 || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
function resolveDataDir() {
  const raw = env("PIPELINE_DATA_DIR", ".data");
  return path.isAbsolute(raw) ? raw : path.join(
    /* turbopackIgnore: true */
    process.cwd(),
    raw
  );
}
function normalizeMongoUri(uri) {
  const trimmed = uri.trim();
  const match = trimmed.match(/^(mongodb(?:\+srv)?:\/\/)([^/?#]+)(@)(.+)$/i);
  if (!match) return trimmed;
  const [, scheme, userInfo, at, hostAndRest] = match;
  const colon = userInfo.indexOf(":");
  if (colon < 0) return trimmed;
  const username = userInfo.slice(0, colon);
  const password = userInfo.slice(colon + 1);
  if (!username || !password) return trimmed;
  let userDecoded = username;
  let passDecoded = password;
  try {
    userDecoded = decodeURIComponent(username);
    passDecoded = decodeURIComponent(password);
  } catch {
  }
  return `${scheme}${encodeURIComponent(userDecoded)}:${encodeURIComponent(passDecoded)}${at}${hostAndRest}`;
}
function resolveStorageBackend() {
  if (onVercel) return "mongodb";
  return env("STORAGE_BACKEND", "file") === "mongodb" ? "mongodb" : "file";
}
var rawMongoUri, onVercel, appConfig;
var init_env = __esm({
  "src/config/env.ts"() {
    "use strict";
    if (!process.env.VERCEL) {
      loadDotenv({ quiet: true });
    }
    rawMongoUri = env("MONGODB_URI");
    onVercel = Boolean(process.env.VERCEL);
    appConfig = {
      dataDir: resolveDataDir(),
      requestTimeoutMs: envInt("REQUEST_TIMEOUT_MS", 3e4),
      maxSources: envInt("MAX_SOURCES", 8),
      maxFetchConcurrency: envInt("MAX_FETCH_CONCURRENCY", 2),
      userAgent: env(
        "PIPELINE_USER_AGENT",
        "SpanwrapBlogPipeline/1.0 (+https://spanwrap.com; research bot; contact: pipeline)"
      ),
      respectRobotsTxt: envBool("RESPECT_ROBOTS_TXT", true),
      storage: {
        /** file (default locally) or mongodb. Vercel always uses mongodb (ephemeral disk). */
        backend: resolveStorageBackend(),
        mongoUri: rawMongoUri ? normalizeMongoUri(rawMongoUri) : void 0,
        mongoDb: env("MONGODB_DB", "spanwrap_pipeline"),
        mongoCollection: env("MONGODB_COLLECTION", "pipeline_runs")
      },
      ui: {
        host: env("UI_HOST", process.env.VERCEL ? "0.0.0.0" : "127.0.0.1"),
        /** Vercel sets PORT; locally UI_PORT (default 8787) is used. */
        port: envInt("PORT", envInt("UI_PORT", 8787))
      },
      trends: {
        /** comma list: hackernews,reddit,devto,mock */
        sources: (env("TRENDS_SOURCES", "hackernews,reddit") || "hackernews,reddit").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
        redditSubreddits: (env(
          "TRENDS_REDDIT_SUBREDDITS",
          "technology,programming,MachineLearning,startups,saas,artificial"
        ) || "technology,programming").split(",").map((s) => s.trim().replace(/^r\//, "")).filter(Boolean),
        digestRedditSubreddits: (env(
          "TRENDS_DIGEST_REDDIT_SUBREDDITS",
          "artificial,MachineLearning,LocalLLaMA,OpenAI,ChatGPT,LanguageTechnology"
        ) || "artificial,MachineLearning").split(",").map((s) => s.trim().replace(/^r\//, "")).filter(Boolean),
        githubTopics: (env("TRENDS_GITHUB_TOPICS", "ai,machine-learning,llm,generative-ai,deep-learning") || "ai,machine-learning").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
        githubToken: env("GITHUB_TOKEN") ?? env("GH_TOKEN"),
        githubSource: (() => {
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
        cacheTtlMinutes: envInt("TRENDS_CACHE_TTL_MINUTES", 60)
      },
      research: {
        provider: env("RESEARCH_PROVIDER", "auto"),
        serperApiKey: env("SERPER_API_KEY"),
        tavilyApiKey: env("TAVILY_API_KEY")
      },
      llm: {
        /**
         * auto | groq | openai | gemini | anthropic | mock
         * auto uses Groq when GROQ_API_KEY / LLM_API_KEY is set.
         */
        provider: env("LLM_PROVIDER", "auto"),
        apiKey: env("GROQ_API_KEY") ?? env("LLM_API_KEY") ?? env("OPENAI_API_KEY") ?? env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY") ?? env("ANTHROPIC_API_KEY") ?? env("CLAUDE_API_KEY") ?? env("DEEPSEEK_API_KEY"),
        baseUrl: env("LLM_BASE_URL", "https://api.groq.com/openai/v1"),
        /** Groq retired llama-3.3-70b-versatile on 2026-08-16; gpt-oss-20b is the free production replacement. */
        model: env("LLM_MODEL", "openai/gpt-oss-20b"),
        /** Prompt compaction — keep LLM input small without dropping research usefulness. */
        promptMaxSources: envInt("LLM_PROMPT_MAX_SOURCES", 5),
        promptAnalysisSourceChars: envInt("LLM_PROMPT_ANALYSIS_SOURCE_CHARS", 1800),
        promptGenerationSourceChars: envInt("LLM_PROMPT_GENERATION_SOURCE_CHARS", 1200),
        promptMaxClaims: envInt("LLM_PROMPT_MAX_CLAIMS", 18),
        promptMaxClaimChars: envInt("LLM_PROMPT_MAX_CLAIM_CHARS", 180),
        promptMaxTemplateChars: envInt("LLM_PROMPT_MAX_TEMPLATE_CHARS", 2500),
        promptMaxKeyPoints: envInt("LLM_PROMPT_MAX_KEY_POINTS", 4),
        /** Chat completions abort after this. Reasoning models need more than REQUEST_TIMEOUT_MS. */
        requestTimeoutMs: envInt("LLM_REQUEST_TIMEOUT_MS", 18e4)
      },
      images: {
        provider: env("IMAGE_PROVIDER", "auto"),
        geminiApiKey: env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY"),
        outputDir: env("IMAGE_OUTPUT_DIR", ".data/images"),
        maxSectionImages: envInt("IMAGE_MAX_SECTION_IMAGES", 3)
      },
      spanwrap: {
        apiUrl: env("SPANWRAP_API_URL", "http://localhost:4000"),
        apiKey: env("SPANWRAP_API_KEY"),
        blogsPath: env("SPANWRAP_BLOGS_PATH", "/api/blogs")
      },
      seo: {
        targetKeywordDensity: envInt("SEO_KEYWORD_DENSITY_PCT", 2) / 100,
        minTitleLength: envInt("SEO_MIN_TITLE_LENGTH", 50),
        maxTitleLength: envInt("SEO_MAX_TITLE_LENGTH", 60),
        minDescLength: envInt("SEO_MIN_DESC_LENGTH", 150),
        maxDescLength: envInt("SEO_MAX_DESC_LENGTH", 160)
      },
      social: {
        blogBaseUrl: env("BLOG_BASE_URL", "https://spanwrap.com/blog"),
        xApiKey: env("X_API_KEY"),
        xApiSecret: env("X_API_SECRET"),
        xAccessToken: env("X_ACCESS_TOKEN"),
        xAccessSecret: env("X_ACCESS_SECRET"),
        linkedinAccessToken: env("LINKEDIN_ACCESS_TOKEN"),
        redditClientId: env("REDDIT_CLIENT_ID"),
        redditClientSecret: env("REDDIT_CLIENT_SECRET"),
        redditUsername: env("REDDIT_USERNAME"),
        redditPassword: env("REDDIT_PASSWORD"),
        autoPromote: envBool("AUTO_PROMOTE_AFTER_PUBLISH", false)
      },
      analytics: {
        dataDir: env("ANALYTICS_DATA_DIR", ".data/analytics"),
        updateIntervalMinutes: envInt("ANALYTICS_UPDATE_INTERVAL_MINUTES", 360)
      },
      publishing: {
        medium: {
          token: env("MEDIUM_TOKEN"),
          canonicalBase: env("MEDIUM_CANONICAL_BASE")
        },
        devto: {
          apiKey: env("DEVTO_API_KEY"),
          canonicalBase: env("DEVTO_CANONICAL_BASE")
        },
        hashnode: {
          token: env("HASHNODE_TOKEN"),
          publicationId: env("HASHNODE_PUBLICATION_ID"),
          canonicalBase: env("HASHNODE_CANONICAL_BASE")
        },
        wordpress: {
          url: env("WORDPRESS_URL"),
          user: env("WORDPRESS_USER"),
          appPassword: env("WORDPRESS_APP_PASSWORD")
        },
        substack: {
          draftsDir: env("SUBSTACK_DRAFTS_DIR", ".data/substack-drafts")
        }
      },
      retry: {
        maxAttempts: envInt("RETRY_MAX_ATTEMPTS", 3),
        baseDelayMs: envInt("RETRY_BASE_DELAY_MS", 500)
      },
      auth: {
        /** Optional bootstrap account created on first boot if no users exist. */
        username: env("AUTH_USERNAME"),
        password: env("AUTH_PASSWORD"),
        /** HMAC secret for session cookies. Generated into .data/auth-secret when unset locally. */
        secret: env("AUTH_SECRET"),
        sessionDays: envInt("AUTH_SESSION_DAYS", 7)
      }
    };
  }
});

// src/config/index.ts
var init_config = __esm({
  "src/config/index.ts"() {
    "use strict";
    init_env();
  }
});

// src/models/topics.ts
import { z } from "zod";
var TrendSignalSchema, TopicRecommendationSchema, TechDigestItemSchema, TechDigestSchema;
var init_topics = __esm({
  "src/models/topics.ts"() {
    "use strict";
    TrendSignalSchema = z.object({
      platform: z.string(),
      title: z.string(),
      url: z.string().url().optional(),
      score: z.number().default(0),
      comments: z.number().default(0),
      author: z.string().optional(),
      community: z.string().optional(),
      description: z.string().default(""),
      imageUrl: z.string().nullable().default(null),
      capturedAt: z.string()
    });
    TopicRecommendationSchema = z.object({
      id: z.string(),
      topic: z.string().min(3),
      summary: z.string().default(""),
      whyItMatters: z.string().default(""),
      blogAngle: z.string().default(""),
      keywords: z.array(z.string()).default([]),
      heatScore: z.number().min(0).max(100),
      platforms: z.array(z.string()).default([]),
      signals: z.array(TrendSignalSchema).default([]),
      discoveredAt: z.string(),
      expiresAt: z.string().nullable().default(null)
    });
    TechDigestItemSchema = z.object({
      platform: z.enum([
        "github",
        "reddit",
        "x",
        "hackernews",
        "devto",
        "arxiv",
        "huggingface",
        "lobsters",
        "news"
      ]),
      title: z.string().min(1),
      description: z.string().default(""),
      url: z.string().url(),
      imageUrl: z.string().nullable().default(null),
      score: z.number().default(0),
      comments: z.number().default(0),
      author: z.string().optional(),
      community: z.string().optional(),
      capturedAt: z.string()
    });
    TechDigestSchema = z.object({
      generatedAt: z.string(),
      theme: z.string().default("AI/ML technology"),
      github: z.array(TechDigestItemSchema).default([]),
      reddit: z.array(TechDigestItemSchema).default([]),
      x: z.array(TechDigestItemSchema).default([]),
      /** HN, Dev.to, arXiv, Hugging Face, Lobsters, and tech-press RSS. */
      more: z.array(TechDigestItemSchema).default([]),
      notes: z.array(z.string()).default([])
    });
  }
});

// src/models/index.ts
import { z as z2 } from "zod";
function parsePublishTargets(input) {
  const allowed = new Set(PUBLISH_TARGET_VALUES);
  const unique = [];
  const arr = Array.isArray(input) ? input : [];
  for (const item of arr) {
    if (typeof item !== "string" || !allowed.has(item)) continue;
    const target = item;
    if (!unique.includes(target)) unique.push(target);
  }
  if (!unique.length) {
    throw new Error("Select at least one publishing target");
  }
  return unique;
}
var ContentBriefSchema, ArticleTemplateSchema, SourceSchema, ClaimSchema, ResearchAnalysisSchema, OutlineSectionSchema, BlogOutlineSchema, BlogSourceRefSchema, GeneratedBlogSchema, QualityIssueSchema, QualityResultSchema, PUBLISH_TARGET_VALUES, PublishTargetSchema, PublishResultSchema, TargetPublishResultSchema, PipelineStatusSchema, StageRecordSchema, PipelineRunSchema;
var init_models = __esm({
  "src/models/index.ts"() {
    "use strict";
    init_topics();
    ContentBriefSchema = z2.object({
      topic: z2.string().min(3),
      targetAudience: z2.string().min(1).default("general readers"),
      tone: z2.string().min(1).default("clear and professional"),
      contentType: z2.string().min(1).default("educational"),
      keywords: z2.array(z2.string()).default([]),
      referenceUrls: z2.array(z2.string().url()).default([])
    });
    ArticleTemplateSchema = z2.object({
      id: z2.string(),
      name: z2.string().min(1),
      filename: z2.string().default(""),
      markdown: z2.string().min(1),
      notes: z2.string().nullable().default(null),
      createdAt: z2.string(),
      updatedAt: z2.string()
    });
    SourceSchema = z2.object({
      id: z2.string(),
      url: z2.string().url(),
      title: z2.string(),
      sourceName: z2.string(),
      content: z2.string(),
      publishedAt: z2.string().nullable().default(null),
      relevanceScore: z2.number().min(0).max(1).default(0),
      fetchError: z2.string().optional()
    });
    ClaimSchema = z2.object({
      claim: z2.string().min(1),
      sourceIds: z2.array(z2.string()).min(1),
      confidence: z2.number().min(0).max(1).default(0.5),
      category: z2.enum([
        "fact",
        "statistic",
        "argument",
        "example",
        "viewpoint",
        "terminology",
        "quote",
        "verification_needed"
      ]).default("fact")
    });
    ResearchAnalysisSchema = z2.object({
      summary: z2.string(),
      claims: z2.array(ClaimSchema),
      keyArguments: z2.array(z2.string()).default([]),
      competingViewpoints: z2.array(z2.string()).default([]),
      terminology: z2.array(z2.string()).default([]),
      sourceRelationships: z2.array(
        z2.object({
          sourceIds: z2.array(z2.string()),
          relationship: z2.string()
        })
      ).default([])
    });
    OutlineSectionSchema = z2.object({
      heading: z2.string().min(1),
      purpose: z2.string().min(1),
      keyPoints: z2.array(z2.string()).default([]),
      sourceIds: z2.array(z2.string()).default([])
    });
    BlogOutlineSchema = z2.object({
      titleCandidates: z2.array(z2.string()).min(1),
      sections: z2.array(OutlineSectionSchema).min(1)
    });
    BlogSourceRefSchema = z2.object({
      title: z2.string(),
      url: z2.string().url(),
      sourceName: z2.string().optional()
    });
    GeneratedBlogSchema = z2.object({
      title: z2.string().min(1),
      subtitle: z2.string().default(""),
      slug: z2.string().min(1),
      excerpt: z2.string().min(1),
      content: z2.string().min(1),
      tags: z2.array(z2.string()).default([]),
      keywords: z2.array(z2.string()).default([]),
      seoTitle: z2.string().min(1),
      seoDescription: z2.string().min(1),
      sources: z2.array(BlogSourceRefSchema).default([]),
      sourceMap: z2.array(
        z2.object({
          paragraphIndex: z2.number().int().nonnegative(),
          sourceIds: z2.array(z2.string())
        })
      ).default([]),
      featuredImage: z2.union([z2.string(), z2.null()]).optional().transform((v) => typeof v === "string" && v.trim() ? v.trim() : null)
    });
    QualityIssueSchema = z2.object({
      severity: z2.enum(["info", "warning", "error"]),
      type: z2.string(),
      message: z2.string()
    });
    QualityResultSchema = z2.object({
      passed: z2.boolean(),
      score: z2.number().min(0).max(100),
      issues: z2.array(QualityIssueSchema)
    });
    PUBLISH_TARGET_VALUES = ["spanwrap", "medium", "devto", "hashnode", "wordpress", "substack"];
    PublishTargetSchema = z2.enum(PUBLISH_TARGET_VALUES);
    PublishResultSchema = z2.object({
      success: z2.boolean(),
      externalId: z2.string().optional(),
      statusCode: z2.number().optional(),
      message: z2.string(),
      idempotencyKey: z2.string(),
      raw: z2.unknown().optional(),
      target: PublishTargetSchema.optional()
    });
    TargetPublishResultSchema = PublishResultSchema.extend({
      target: PublishTargetSchema
    });
    PipelineStatusSchema = z2.enum([
      "CREATED",
      "RESEARCHING",
      "RESEARCH_COMPLETE",
      "OUTLINE_READY",
      "GENERATING",
      "DRAFT_READY",
      "QUALITY_CHECK",
      "REVIEW_REQUIRED",
      "APPROVED",
      "PUBLISHED",
      "PUBLISH_FAILED",
      "FAILED",
      "CANCELLED"
    ]);
    StageRecordSchema = z2.object({
      stage: z2.string(),
      status: z2.enum(["pending", "running", "completed", "failed", "skipped"]),
      startedAt: z2.string().nullable().default(null),
      endedAt: z2.string().nullable().default(null),
      durationMs: z2.number().nullable().default(null),
      retryCount: z2.number().default(0),
      provider: z2.string().optional(),
      model: z2.string().optional(),
      error: z2.string().nullable().default(null),
      meta: z2.record(z2.string(), z2.unknown()).default({})
    });
    PipelineRunSchema = z2.object({
      id: z2.string(),
      status: PipelineStatusSchema,
      createdAt: z2.string(),
      updatedAt: z2.string(),
      brief: ContentBriefSchema,
      /** Optional article template selected for this run (snapshot stored for stable generation). */
      templateId: z2.string().nullable().default(null),
      templateName: z2.string().nullable().default(null),
      templateMarkdown: z2.string().nullable().default(null),
      sources: z2.array(SourceSchema).default([]),
      analysis: ResearchAnalysisSchema.nullable().default(null),
      outline: BlogOutlineSchema.nullable().default(null),
      article: GeneratedBlogSchema.nullable().default(null),
      quality: QualityResultSchema.nullable().default(null),
      /** When true, Gemini generates hero/section images after the article draft. */
      generateImages: z2.boolean().default(false),
      /** Sites selected in Quality review for the eventual publish step. */
      publishTargets: z2.array(PublishTargetSchema).default(["spanwrap"]),
      publishResult: PublishResultSchema.nullable().default(null),
      publishResults: z2.array(TargetPublishResultSchema).default([]),
      stages: z2.array(StageRecordSchema).default([]),
      reviewNotes: z2.string().nullable().default(null),
      error: z2.string().nullable().default(null),
      /** Which stage caused the failure — lets the UI offer "Retry from X". */
      failedStage: z2.string().nullable().default(null),
      /** Machine-readable error code (e.g. "LLM_TIMEOUT", "RATE_LIMIT", "RESEARCH_EMPTY"). */
      errorCode: z2.string().nullable().default(null),
      /** True when the error is transient and a retry has a reasonable chance of succeeding. */
      retryable: z2.boolean().default(false),
      idempotencyKey: z2.string()
    });
  }
});

// src/utils/slug.ts
import slugifyLib from "slugify";
function toSlug(input) {
  const slug = slugifyLib(input, {
    lower: true,
    strict: true,
    trim: true
  });
  return slug || "untitled-post";
}
var init_slug = __esm({
  "src/utils/slug.ts"() {
    "use strict";
  }
});

// src/providers/llm/mock.ts
function detectMockKind(lower, schema) {
  if (schema === GeneratedBlogSchema || lower.includes("write a complete original blog article")) {
    return "article";
  }
  if (schema === BlogOutlineSchema || lower.includes("create a blog outline")) {
    return "outline";
  }
  if (schema === ResearchAnalysisSchema || lower.includes("performing research analysis") || lower.includes("using only the sources below")) {
    return "analysis";
  }
  return "unknown";
}
function extractSourceIds(prompt) {
  const matches = [...prompt.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(matches)];
}
function extractField(prompt, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`, "i");
  return prompt.match(re)?.[1] ?? null;
}
function extractSourcesFromPrompt(prompt) {
  const ids = extractSourceIds(prompt);
  return ids.map((id, i) => ({
    id,
    url: `https://example.com/source-${i + 1}`,
    title: `Source ${i + 1}`,
    sourceName: "example.com",
    content: "Example content.",
    publishedAt: null,
    relevanceScore: 0.8
  }));
}
var MockLLMProvider;
var init_mock = __esm({
  "src/providers/llm/mock.ts"() {
    "use strict";
    init_models();
    init_slug();
    MockLLMProvider = class {
      name = "mock";
      model = "mock-1";
      async generateText(prompt) {
        return `Mock response for: ${prompt.slice(0, 80)}`;
      }
      async generateStructured(prompt, schema) {
        const lower = prompt.toLowerCase();
        const kind = detectMockKind(lower, schema);
        if (kind === "analysis") {
          const sourceIds = extractSourceIds(prompt);
          const data = {
            summary: "Mock analysis summarizing the collected research with source-backed claims only.",
            claims: sourceIds.slice(0, 3).map((id, i) => ({
              claim: `Mock claim ${i + 1} grounded in research source ${id}.`,
              sourceIds: [id],
              confidence: 0.8,
              category: "fact"
            })),
            keyArguments: ["Operators should ground support automation in clear escalation paths."],
            competingViewpoints: [
              "Some teams prefer human-only support for complex account work."
            ],
            terminology: ["AI agent", "escalation", "deflection"],
            sourceRelationships: sourceIds.length ? [{ sourceIds: sourceIds.slice(0, 2), relationship: "cover related product claims" }] : []
          };
          return schema.parse(data);
        }
        if (kind === "outline") {
          const sourceIds = extractSourceIds(prompt);
          const topic = extractField(prompt, "topic") ?? "AI agents";
          const data = {
            titleCandidates: [
              `${topic}: a practical guide`,
              `How ${topic} changes day-to-day work`,
              `What founders should know about ${topic}`
            ],
            sections: [
              {
                heading: "Why this matters now",
                purpose: "Frame the problem for the target audience",
                keyPoints: ["Context", "Costs of inaction"],
                sourceIds: sourceIds.slice(0, 1)
              },
              {
                heading: "What the research shows",
                purpose: "Present source-backed findings",
                keyPoints: ["Key facts", "Trade-offs"],
                sourceIds: sourceIds.slice(0, 2)
              },
              {
                heading: "How to apply it",
                purpose: "Give concrete next steps",
                keyPoints: ["Pilot approach", "Metrics to watch"],
                sourceIds: sourceIds.slice(0, 2)
              },
              {
                heading: "Conclusion",
                purpose: "Summarize without empty platitudes",
                keyPoints: ["Decision checklist"],
                sourceIds: []
              }
            ]
          };
          return schema.parse(data);
        }
        if (kind === "article") {
          const topic = extractField(prompt, "topic") ?? "AI agents in customer support";
          const title = `${topic}: a practical guide for founders`;
          const sources = extractSourcesFromPrompt(prompt);
          const bodySections = [
            "Customer support teams are under constant pressure to answer faster without losing quality. AI agents can help, but only when they are grounded in clear workflows and human escalation.",
            "Startups often treat support automation as pure cost reduction. The more useful framing is reliability: reduced wait times, consistent answers, and cleaner handoffs when a person is required.",
            sources.length ? `Public sources such as ${sources[0]?.title ?? "referenced materials"} discuss how agent systems succeed when scope is limited and tools are observable.` : "Research-backed practice favors narrow automation first, then expansion.",
            "Teams that skip escalation design tend to create silent failure modes. The safer pattern is supervised automation with explicit ownership.",
            "1. Pick one high-volume, low-risk intent and document the success criteria.\n2. Wire monitoring so every automated resolution is inspectable.\n3. Keep an easy path to a human for account, billing, and emotional cases.",
            "AI agents are useful in customer support when they are treated as production systems, not demos. Start small, measure carefully, and keep humans in the critical path."
          ];
          let content;
          if (prompt.includes("ARTICLE MARKDOWN TEMPLATE") || prompt.includes("```markdown")) {
            const headingMatches = [...prompt.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
            if (headingMatches.length >= 2 && !prompt.includes("{{body}}")) {
              content = [
                `# ${title}`,
                "",
                ...headingMatches.flatMap((h, i) => [
                  `## ${h}`,
                  "",
                  bodySections[i % bodySections.length],
                  ""
                ])
              ].join("\n");
            } else {
              content = bodySections.join("\n\n");
            }
          } else {
            content = [
              `# ${title}`,
              "",
              "![Support workflow](https://opengraph.githubassets.com/1/example/weekly-ai-agent)",
              "",
              bodySections[0],
              "",
              "## Why this matters now",
              "",
              bodySections[1],
              "",
              "## What the research shows",
              "",
              bodySections[2],
              "",
              bodySections[3],
              "",
              "## How to apply it",
              "",
              bodySections[4],
              "",
              "## Conclusion",
              "",
              bodySections[5]
            ].join("\n");
          }
          const data = {
            title,
            subtitle: "A grounded, implementation-first look",
            slug: toSlug(title),
            excerpt: "How startup founders can deploy AI agents in customer support without sacrificing trust or quality.",
            content,
            tags: ["ai-agents", "customer-support", "startups"],
            keywords: ["AI agents", "customer support", "automation"],
            seoTitle: title.slice(0, 60),
            seoDescription: "Practical guidance for founders on using AI agents in customer support with clear escalation and measurement.",
            featuredImage: "https://opengraph.githubassets.com/1/example/weekly-ai-agent",
            sources: sources.map((s) => ({
              title: s.title,
              url: s.url,
              sourceName: s.sourceName
            })),
            sourceMap: [
              { paragraphIndex: 3, sourceIds: sources[0] ? [sources[0].id] : [] }
            ].filter((m) => m.sourceIds.length > 0)
          };
          return schema.parse(data);
        }
        return schema.parse({});
      }
    };
  }
});

// src/config/llm-catalog.ts
function isLlmProviderId(value) {
  return typeof value === "string" && LLM_PROVIDER_IDS.includes(value);
}
function remapRetiredModel(model) {
  const next = RETIRED_LLM_MODELS[model];
  if (!next) return { model };
  return { model: next, remappedFrom: model };
}
function catalogPublic() {
  return LLM_PROVIDER_IDS.map((id) => {
    const p = LLM_CATALOG[id];
    return {
      id: p.id,
      label: p.label,
      defaultModel: p.defaultModel,
      models: p.models,
      keyLabel: p.keyLabel,
      keyUrl: p.keyUrl
    };
  });
}
var LLM_PROVIDER_IDS, RETIRED_LLM_MODELS, DEFAULT_GROQ_MODEL, LLM_CATALOG;
var init_llm_catalog = __esm({
  "src/config/llm-catalog.ts"() {
    "use strict";
    LLM_PROVIDER_IDS = ["groq", "openai", "gemini", "anthropic", "deepseek", "mock"];
    RETIRED_LLM_MODELS = {
      "llama-3.3-70b-versatile": "openai/gpt-oss-20b",
      "llama-3.3-70b-specdec": "openai/gpt-oss-20b",
      "llama-3.1-8b-instant": "openai/gpt-oss-20b",
      "llama-3.1-70b-versatile": "openai/gpt-oss-20b",
      "llama-3.1-70b-specdec": "openai/gpt-oss-20b"
    };
    DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
    LLM_CATALOG = {
      groq: {
        id: "groq",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        defaultModel: DEFAULT_GROQ_MODEL,
        models: [
          { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B (free, fast)" },
          { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (higher quality, 8k TPM on free tier)" },
          { id: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B" }
        ],
        keyLabel: "Groq API key",
        keyUrl: "https://console.groq.com/keys",
        extraHeaders: {},
        jsonMode: true
      },
      openai: {
        id: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        models: [
          { id: "gpt-4o-mini", label: "GPT-4o mini" },
          { id: "gpt-4o", label: "GPT-4o" },
          { id: "gpt-4.1-mini", label: "GPT-4.1 mini" }
        ],
        keyLabel: "OpenAI API key",
        keyUrl: "https://platform.openai.com/api-keys",
        extraHeaders: {},
        jsonMode: true
      },
      gemini: {
        id: "gemini",
        label: "Gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        defaultModel: "gemini-2.5-flash",
        models: [
          { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
          { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
          { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }
        ],
        keyLabel: "Gemini API key",
        keyUrl: "https://aistudio.google.com/apikey",
        extraHeaders: {},
        jsonMode: true
      },
      anthropic: {
        id: "anthropic",
        label: "Claude",
        baseUrl: "https://api.anthropic.com/v1",
        defaultModel: "claude-sonnet-4-0",
        models: [
          { id: "claude-sonnet-4-0", label: "Claude Sonnet 4" },
          { id: "claude-3-5-haiku-latest", label: "Claude Haiku 3.5" },
          { id: "claude-3-5-sonnet-latest", label: "Claude Sonnet 3.5" }
        ],
        keyLabel: "Anthropic API key",
        keyUrl: "https://console.anthropic.com/settings/keys",
        extraHeaders: { "anthropic-version": "2023-06-01" },
        jsonMode: false
      },
      deepseek: {
        id: "deepseek",
        label: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        defaultModel: "deepseek-chat",
        models: [
          { id: "deepseek-chat", label: "DeepSeek V3" },
          { id: "deepseek-reasoner", label: "DeepSeek R1" }
        ],
        keyLabel: "DeepSeek API key",
        keyUrl: "https://platform.deepseek.com/api_keys",
        extraHeaders: {},
        jsonMode: true
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
        jsonMode: false
      }
    };
  }
});

// src/services/mongo-connection.ts
import { MongoClient } from "mongodb";
function normalizeMongoUri2(uri) {
  const trimmed = uri.trim();
  const match = trimmed.match(/^(mongodb(?:\+srv)?:\/\/)([^/?#]+)(@)(.+)$/i);
  if (!match) return trimmed;
  const [, scheme, userInfo, at, hostAndRest] = match;
  const colon = userInfo.indexOf(":");
  if (colon < 0) return trimmed;
  const username = userInfo.slice(0, colon);
  const password = userInfo.slice(colon + 1);
  if (!username || !password) return trimmed;
  let userDecoded = username;
  let passDecoded = password;
  try {
    userDecoded = decodeURIComponent(username);
    passDecoded = decodeURIComponent(password);
  } catch {
  }
  return `${scheme}${encodeURIComponent(userDecoded)}:${encodeURIComponent(passDecoded)}${at}${hostAndRest}`;
}
function formatMongoError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("bad auth") || lower.includes("authentication failed") || lower.includes("auth failed")) {
    return [
      "MongoDB authentication failed.",
      "Check MONGODB_URI username/password in .env or Vercel env vars,",
      "reset the database user password in Atlas \u2192 Database Access,",
      "and ensure Network Access allows your IP (use 0.0.0.0/0 on Vercel)."
    ].join(" ");
  }
  if (lower.includes("enotfound") || lower.includes("getaddrinfo")) {
    return `MongoDB host not found. Check the cluster hostname in MONGODB_URI. (${message})`;
  }
  if (lower.includes("ip") && lower.includes("whitelist")) {
    return `MongoDB blocked this IP. Add it in Atlas \u2192 Network Access. (${message})`;
  }
  return `MongoDB error: ${message}`;
}
async function connectMongo(uri, dbName, options = {}) {
  const normalized = normalizeMongoUri2(uri);
  const client = new MongoClient(normalized, {
    serverSelectionTimeoutMS: 15e3,
    ...options
  });
  try {
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    return { client, db };
  } catch (error) {
    await client.close().catch(() => void 0);
    throw new Error(formatMongoError(error));
  }
}
var init_mongo_connection = __esm({
  "src/services/mongo-connection.ts"() {
    "use strict";
  }
});

// src/services/logger.ts
function redact(value) {
  if (typeof value === "string") {
    if (SENSITIVE.test(value) && value.length > 8) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}
function log(level, message, meta) {
  const entry = {
    level,
    message,
    time: (/* @__PURE__ */ new Date()).toISOString(),
    ...meta ? { meta: redact(meta) } : {}
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
var SENSITIVE, logger;
var init_logger = __esm({
  "src/services/logger.ts"() {
    "use strict";
    SENSITIVE = /(api[_-]?key|password|secret|token|authorization|bearer)/i;
    logger = {
      debug: (message, meta) => log("debug", message, meta),
      info: (message, meta) => log("info", message, meta),
      warn: (message, meta) => log("warn", message, meta),
      error: (message, meta) => log("error", message, meta)
    };
  }
});

// src/services/llm-settings.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path2 from "node:path";
async function llmSettingsCollection() {
  if (appConfig.storage.backend !== "mongodb" || !appConfig.storage.mongoUri) return null;
  if (mongoCol) return mongoCol;
  const { db } = await connectMongo(appConfig.storage.mongoUri, appConfig.storage.mongoDb);
  mongoCol = db.collection("llm_settings");
  return mongoCol;
}
function settingsFilePath() {
  return path2.join(appConfig.dataDir, "llm-settings.json");
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
  return void 0;
}
function providerFromEnv() {
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
function sanitizeApiKey(value) {
  return value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}
function parseStored(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw;
  if (!isLlmProviderId(rec.provider)) return null;
  if (typeof rec.model !== "string" || !rec.model.trim()) return null;
  return {
    provider: rec.provider,
    model: rec.model.trim(),
    apiKey: typeof rec.apiKey === "string" && rec.apiKey.trim() ? sanitizeApiKey(rec.apiKey) : void 0,
    baseUrl: typeof rec.baseUrl === "string" && rec.baseUrl.trim() ? rec.baseUrl.trim() : void 0,
    updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : (/* @__PURE__ */ new Date()).toISOString()
  };
}
function loadFileSync() {
  try {
    const raw = JSON.parse(readFileSync(settingsFilePath(), "utf8"));
    return parseStored(raw);
  } catch {
    return null;
  }
}
async function loadMongo() {
  try {
    const col = await llmSettingsCollection();
    if (!col) return null;
    const doc = await col.findOne({ _id: SETTINGS_ID });
    if (!doc) return null;
    const { _id: _ignored, ...rest } = doc;
    return parseStored(rest);
  } catch (error) {
    logger.warn("Could not load LLM settings from MongoDB", {
      error: error instanceof Error ? formatMongoError(error) : String(error)
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
  if (!col) return;
  const id = SETTINGS_ID;
  await col.replaceOne({ _id: id }, { _id: id, ...settings }, { upsert: true });
}
function resolveLlmConfig(stored) {
  const source = stored ? "ui" : "env";
  const provider = stored?.provider ?? providerFromEnv();
  const info = LLM_CATALOG[provider];
  const requested = stored?.model || appConfig.llm.model || info.defaultModel;
  const { model, remappedFrom } = remapRetiredModel(requested);
  const apiKey = provider === "mock" ? void 0 : stored?.apiKey || envKeyFor(provider) || appConfig.llm.apiKey;
  const baseUrl = stored?.baseUrl || info.baseUrl || appConfig.llm.baseUrl;
  return {
    provider,
    model: provider === "mock" ? "mock-1" : model,
    apiKey: provider === "mock" ? void 0 : apiKey,
    baseUrl,
    extraHeaders: info.extraHeaders,
    jsonMode: info.jsonMode,
    remappedFrom,
    source
  };
}
function normalizeResolved(cfg) {
  if (cfg.provider !== "mock" && !cfg.apiKey) {
    return { ...cfg, provider: "mock", model: "mock-1", apiKey: void 0 };
  }
  return cfg;
}
async function ensureLlmSettings() {
  if (loaded) return;
  const fromMongo = await loadMongo();
  cache = fromMongo ?? loadFileSync();
  loaded = true;
}
function getResolvedLlmConfig() {
  if (!loaded && cache === null) {
    cache = loadFileSync();
  }
  return normalizeResolved(resolveLlmConfig(cache));
}
function maskApiKey(key) {
  if (!key) return null;
  if (key.length <= 8) return "\u2022\u2022\u2022\u2022";
  return `${key.slice(0, 4)}\u2026${key.slice(-4)}`;
}
function publicLlmStatus() {
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
    providers: catalogPublic()
  };
}
async function saveLlmSettings(input) {
  if (!isLlmProviderId(input.provider)) {
    throw new Error("Unknown LLM provider");
  }
  const info = LLM_CATALOG[input.provider];
  const requested = typeof input.model === "string" && input.model.trim() ? input.model.trim() : info.defaultModel;
  const { model } = remapRetiredModel(requested);
  const incomingKey = typeof input.apiKey === "string" ? sanitizeApiKey(input.apiKey) : "";
  const previous = cache ?? loadFileSync();
  const apiKey = input.provider === "mock" ? void 0 : incomingKey || previous?.apiKey || envKeyFor(input.provider) || appConfig.llm.apiKey;
  if (input.provider !== "mock" && !apiKey) {
    throw new Error(`Paste a ${info.keyLabel} to use ${info.label}`);
  }
  const baseUrl = typeof input.baseUrl === "string" && input.baseUrl.trim() ? input.baseUrl.trim() : info.baseUrl;
  const stored = {
    provider: input.provider,
    model,
    apiKey,
    baseUrl: baseUrl || void 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  cache = stored;
  loaded = true;
  try {
    writeFileSettings(stored);
  } catch (error) {
    logger.warn("Could not persist LLM settings to disk", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  try {
    await writeMongoSettings(stored);
  } catch (error) {
    logger.warn("Could not persist LLM settings to MongoDB", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return getResolvedLlmConfig();
}
var SETTINGS_ID, cache, loaded, mongoCol;
var init_llm_settings = __esm({
  "src/services/llm-settings.ts"() {
    "use strict";
    init_config();
    init_llm_catalog();
    init_mongo_connection();
    init_logger();
    SETTINGS_ID = "current";
    cache = null;
    loaded = false;
    mongoCol = null;
  }
});

// src/utils/retry.ts
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
function isTransientError(error) {
  if (!error || typeof error !== "object") return false;
  const e = error;
  const status = e.status ?? e.statusCode;
  if (status === 413) return false;
  if (status === 429 || status === 408) return true;
  if (typeof status === "number" && status >= 500) return true;
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  if (e.code === "ECONNRESET" || e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED" || e.code === "ENOTFOUND") {
    return e.code !== "ENOTFOUND";
  }
  const message = (e.message ?? "").toLowerCase();
  return message.includes("timeout") || message.includes("rate limit") || message.includes("temporar") || message.includes("network");
}
async function withRetry(fn, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const shouldRetry = options.shouldRetry ?? isTransientError;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
var init_retry = __esm({
  "src/utils/retry.ts"() {
    "use strict";
  }
});

// src/providers/llm/errors.ts
function extractErrorMessage(body) {
  const raw = body.trim();
  try {
    const json = JSON.parse(raw);
    return json.error?.message || json.message || raw;
  } catch {
    return raw;
  }
}
function tpmCounts(message) {
  const match = message.match(/Limit\s+(\d+)[\s\S]*?Requested\s+(\d+)/i);
  if (!match) return null;
  return { limit: Number(match[1]), requested: Number(match[2]) };
}
function isPromptTooLargeError(status, message) {
  return status === 413 || /request too large|reduce your message size|tokens per minute|\(TPM\)/i.test(message);
}
function formatLlmHttpError(status, body, model) {
  const message = extractErrorMessage(body);
  if (isPromptTooLargeError(status, message)) {
    const modelLabel = model ? ` (${model})` : "";
    const counts = tpmCounts(message);
    const size = counts ? ` This request used ${counts.requested.toLocaleString()} tokens; the cap is ${counts.limit.toLocaleString()} tokens per minute.` : "";
    return `Prompt too large for this LLM${modelLabel}.${size} Shorten the article template (headings and brief instructions only \u2014 not a full sample post), trim research/source text, or switch to a model with a higher input/TPM limit.`;
  }
  if (status === 404 && /model_not_found|does not exist/i.test(message)) {
    return `Model "${model ?? "unknown"}" is unavailable. Open Settings and pick a current model (Groq: openai/gpt-oss-20b).`;
  }
  return `LLM HTTP ${status}: ${message.slice(0, 300)}`;
}
var init_errors = __esm({
  "src/providers/llm/errors.ts"() {
    "use strict";
  }
});

// src/providers/llm/openai-compatible.ts
function sanitizeHeaderValue(value) {
  return (value ?? "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}
function extractJson(text) {
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
function createOpenAICompatibleFromSettings() {
  const cfg = getResolvedLlmConfig();
  if (!cfg.apiKey) {
    throw new Error("An LLM API key is required for this provider");
  }
  return new OpenAICompatibleLLMProvider(cfg.apiKey, cfg.baseUrl, cfg.model, cfg.provider, {
    extraHeaders: cfg.extraHeaders,
    jsonMode: cfg.jsonMode
  });
}
var OpenAICompatibleLLMProvider;
var init_openai_compatible = __esm({
  "src/providers/llm/openai-compatible.ts"() {
    "use strict";
    init_config();
    init_llm_settings();
    init_logger();
    init_retry();
    init_errors();
    OpenAICompatibleLLMProvider = class {
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
      apiKey;
      baseUrl;
      model;
      name;
      extraHeaders;
      jsonMode;
      async chat(messages, options) {
        return withRetry(
          async () => {
            const controller = new AbortController();
            const reasoningModel = /reasoner|r1/i.test(this.model);
            const timeoutMs = reasoningModel ? Math.max(appConfig.llm.requestTimeoutMs, 24e4) : appConfig.llm.requestTimeoutMs;
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const body = {
                model: this.model,
                max_tokens: reasoningModel ? 16384 : this.name === "groq" ? 4096 : 8192,
                messages
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
                  ...this.extraHeaders
                },
                body: JSON.stringify(body)
              });
              if (!response.ok) {
                const errBody = await response.text();
                const error = new Error(formatLlmHttpError(response.status, errBody, this.model));
                error.status = response.status;
                throw error;
              }
              const data = await response.json();
              const content = data.choices?.[0]?.message?.content;
              if (!content) throw new Error("Empty LLM response");
              return content;
            } catch (error) {
              if (error instanceof Error && error.name === "AbortError") {
                throw new Error(
                  `LLM request timed out after ${Math.round(timeoutMs / 1e3)}s (${this.name}/${this.model}). Use deepseek-chat for drafting, or raise LLM_REQUEST_TIMEOUT_MS.`
                );
              }
              throw error;
            } finally {
              clearTimeout(timer);
            }
          },
          {
            maxAttempts: appConfig.retry.maxAttempts,
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
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
        );
      }
      async generateText(prompt) {
        return this.chat([{ role: "user", content: prompt }]);
      }
      async generateStructured(prompt, schema, options) {
        const system = options?.system ?? "You are a careful research assistant. Respond with valid JSON only matching the requested schema. Never invent source IDs or URLs.";
        const text = await this.chat(
          [
            { role: "system", content: system },
            {
              role: "user",
              content: `${prompt}

Return ONLY valid JSON (a single JSON object).`
            }
          ],
          { json: true }
        );
        const parsed = extractJson(text);
        return schema.parse(parsed);
      }
    };
  }
});

// src/providers/llm/index.ts
function createLLMProvider(override) {
  if (override === "mock") return new MockLLMProvider();
  const cfg = getResolvedLlmConfig();
  if (cfg.provider === "mock" || !cfg.apiKey) return new MockLLMProvider();
  return createOpenAICompatibleFromSettings();
}
var init_llm = __esm({
  "src/providers/llm/index.ts"() {
    "use strict";
    init_mock();
    init_openai_compatible();
    init_llm_settings();
    init_mock();
    init_openai_compatible();
  }
});

// src/providers/publishing/mock.ts
var publishedKeys, MockPublisher;
var init_mock2 = __esm({
  "src/providers/publishing/mock.ts"() {
    "use strict";
    publishedKeys = /* @__PURE__ */ new Map();
    MockPublisher = class {
      constructor(behavior = "success") {
        this.behavior = behavior;
      }
      behavior;
      name = "mock-publisher";
      async publish(blog, options) {
        const existing = publishedKeys.get(options.idempotencyKey);
        if (existing?.success) {
          return { ...existing, message: "Idempotent replay: already published" };
        }
        if (this.behavior === "auth") {
          return {
            success: false,
            statusCode: 401,
            message: "Unauthorized",
            idempotencyKey: options.idempotencyKey
          };
        }
        if (this.behavior === "validation") {
          return {
            success: false,
            statusCode: 400,
            message: "Validation failed",
            idempotencyKey: options.idempotencyKey
          };
        }
        if (this.behavior === "rate_limit") {
          return {
            success: false,
            statusCode: 429,
            message: "Rate limited",
            idempotencyKey: options.idempotencyKey
          };
        }
        if (this.behavior === "server") {
          return {
            success: false,
            statusCode: 500,
            message: "Server error",
            idempotencyKey: options.idempotencyKey
          };
        }
        if (this.behavior === "timeout") {
          return {
            success: false,
            message: "Request timeout",
            idempotencyKey: options.idempotencyKey
          };
        }
        const result = {
          success: true,
          externalId: `sw_${blog.slug}`,
          statusCode: 201,
          message: "Published successfully",
          idempotencyKey: options.idempotencyKey,
          raw: { id: `sw_${blog.slug}`, slug: blog.slug }
        };
        publishedKeys.set(options.idempotencyKey, result);
        return result;
      }
    };
  }
});

// src/providers/publishing/spanwrap.ts
var SpanwrapPublisher;
var init_spanwrap = __esm({
  "src/providers/publishing/spanwrap.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_retry();
    SpanwrapPublisher = class {
      constructor(apiUrl = appConfig.spanwrap.apiUrl, apiKey = appConfig.spanwrap.apiKey, blogsPath = appConfig.spanwrap.blogsPath) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.blogsPath = blogsPath;
      }
      apiUrl;
      apiKey;
      blogsPath;
      name = "spanwrap";
      toPayload(blog) {
        return {
          title: blog.title,
          slug: blog.slug,
          excerpt: blog.excerpt,
          content: blog.content,
          tags: blog.tags,
          keywords: blog.keywords,
          seo_title: blog.seoTitle,
          seo_description: blog.seoDescription,
          featured_image: blog.featuredImage,
          published_at: blog.publishedAt,
          sources: blog.sources.map((s) => ({
            title: s.title,
            url: s.url,
            source_name: s.sourceName ?? null
          }))
        };
      }
      async publish(blog, options) {
        if (!this.apiKey) {
          return {
            success: false,
            message: "SPANWRAP_API_KEY is not configured",
            statusCode: 401,
            idempotencyKey: options.idempotencyKey
          };
        }
        const endpoint = `${this.apiUrl.replace(/\/$/, "")}${this.blogsPath.startsWith("/") ? this.blogsPath : `/${this.blogsPath}`}`;
        const payload = this.toPayload(blog);
        try {
          const result = await withRetry(
            async () => {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
              try {
                const response = await fetch(endpoint, {
                  method: "POST",
                  signal: controller.signal,
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                    "Idempotency-Key": options.idempotencyKey
                  },
                  body: JSON.stringify(payload)
                });
                const text = await response.text();
                let raw = text;
                try {
                  raw = text ? JSON.parse(text) : null;
                } catch {
                }
                if (response.status === 401 || response.status === 403) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Authentication/authorization failed (${response.status})`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                if (response.status === 400 || response.status === 404 || response.status === 422) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Validation or not-found error (${response.status})`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                if (response.status === 429 || response.status >= 500) {
                  const error = new Error(`Spanwrap temporary error ${response.status}`);
                  error.status = response.status;
                  throw error;
                }
                if (!response.ok) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Publish failed with HTTP ${response.status}`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                const externalId = raw && typeof raw === "object" && "id" in raw ? String(raw.id) : void 0;
                return {
                  success: true,
                  externalId,
                  statusCode: response.status,
                  message: "Published successfully",
                  idempotencyKey: options.idempotencyKey,
                  raw
                };
              } finally {
                clearTimeout(timer);
              }
            },
            {
              maxAttempts: appConfig.retry.maxAttempts,
              baseDelayMs: appConfig.retry.baseDelayMs,
              onRetry: (error, attempt, delayMs) => {
                logger.warn("Retrying Spanwrap publish", {
                  attempt,
                  delayMs,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          );
          return result;
        } catch (error) {
          const status = error.status;
          return {
            success: false,
            statusCode: status,
            message: error instanceof Error ? error.message : "Publish failed",
            idempotencyKey: options.idempotencyKey
          };
        }
      }
    };
  }
});

// src/providers/publishing/medium.ts
var MediumPublisher;
var init_medium = __esm({
  "src/providers/publishing/medium.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_retry();
    MediumPublisher = class {
      name = "medium";
      cachedUserId = null;
      get token() {
        return appConfig.publishing.medium.token;
      }
      get canonicalBase() {
        return appConfig.publishing.medium.canonicalBase;
      }
      async getUserId() {
        if (this.cachedUserId) return this.cachedUserId;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
        try {
          const res = await fetch("https://api.medium.com/v1/me", {
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${this.token}`,
              "Content-Type": "application/json"
            }
          });
          if (!res.ok) throw new Error(`Failed to fetch Medium user: ${res.status}`);
          const body = await res.json();
          this.cachedUserId = body.data.id;
          return this.cachedUserId;
        } finally {
          clearTimeout(timer);
        }
      }
      async publish(blog, options) {
        if (!this.token) {
          return {
            success: false,
            message: "MEDIUM_TOKEN is not configured",
            statusCode: 401,
            idempotencyKey: options.idempotencyKey
          };
        }
        try {
          const result = await withRetry(
            async () => {
              const userId = await this.getUserId();
              const canonicalUrl = this.canonicalBase ? `${this.canonicalBase.replace(/\/$/, "")}/${blog.slug}` : void 0;
              const contentPrefix = canonicalUrl ? `*Originally published at [${canonicalUrl}](${canonicalUrl})*

` : "";
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
              try {
                const response = await fetch(
                  `https://api.medium.com/v1/users/${userId}/posts`,
                  {
                    method: "POST",
                    signal: controller.signal,
                    headers: {
                      Authorization: `Bearer ${this.token}`,
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      title: blog.title,
                      contentFormat: "markdown",
                      content: contentPrefix + blog.content,
                      tags: blog.tags.slice(0, 5),
                      canonicalUrl,
                      publishStatus: "draft"
                    })
                  }
                );
                const text = await response.text();
                let raw = text;
                try {
                  raw = text ? JSON.parse(text) : null;
                } catch {
                }
                if (response.status === 401 || response.status === 403) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Medium auth failed (${response.status})`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                if (response.status === 400 || response.status === 404 || response.status === 422) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Medium validation error (${response.status})`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                if (response.status === 429 || response.status >= 500) {
                  const error = new Error(`Medium temporary error ${response.status}`);
                  error.status = response.status;
                  throw error;
                }
                if (!response.ok) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Medium publish failed with HTTP ${response.status}`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                const externalId = raw && typeof raw === "object" && "data" in raw ? String(raw.data.id) : void 0;
                return {
                  success: true,
                  externalId,
                  statusCode: response.status,
                  message: "Published to Medium as draft",
                  idempotencyKey: options.idempotencyKey,
                  raw
                };
              } finally {
                clearTimeout(timer);
              }
            },
            {
              maxAttempts: appConfig.retry.maxAttempts,
              baseDelayMs: appConfig.retry.baseDelayMs,
              onRetry: (error, attempt, delayMs) => {
                logger.warn("Retrying Medium publish", {
                  attempt,
                  delayMs,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          );
          return result;
        } catch (error) {
          const status = error.status;
          return {
            success: false,
            statusCode: status,
            message: error instanceof Error ? error.message : "Medium publish failed",
            idempotencyKey: options.idempotencyKey
          };
        }
      }
    };
  }
});

// src/providers/publishing/devto.ts
var DevtoPublisher;
var init_devto = __esm({
  "src/providers/publishing/devto.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_retry();
    DevtoPublisher = class {
      name = "devto";
      get apiKey() {
        return appConfig.publishing.devto.apiKey;
      }
      get canonicalBase() {
        return appConfig.publishing.devto.canonicalBase;
      }
      async publish(blog, options) {
        if (!this.apiKey) {
          return {
            success: false,
            message: "DEVTO_API_KEY is not configured",
            statusCode: 401,
            idempotencyKey: options.idempotencyKey
          };
        }
        try {
          const result = await withRetry(
            async () => {
              const canonicalUrl = this.canonicalBase ? `${this.canonicalBase.replace(/\/$/, "")}/${blog.slug}` : void 0;
              const tags = blog.tags.slice(0, 4).map((t) => t.toLowerCase().replace(/\s+/g, ""));
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
              try {
                const response = await fetch("https://dev.to/api/articles", {
                  method: "POST",
                  signal: controller.signal,
                  headers: {
                    "api-key": this.apiKey,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    article: {
                      title: blog.title,
                      body_markdown: blog.content,
                      tags,
                      canonical_url: canonicalUrl,
                      description: blog.excerpt,
                      published: false
                    }
                  })
                });
                const text = await response.text();
                let raw = text;
                try {
                  raw = text ? JSON.parse(text) : null;
                } catch {
                }
                if (response.status === 401 || response.status === 403) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Dev.to auth failed (${response.status})`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                if (response.status === 400 || response.status === 422) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Dev.to validation error (${response.status})`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                if (response.status === 429 || response.status >= 500) {
                  const error = new Error(`Dev.to temporary error ${response.status}`);
                  error.status = response.status;
                  throw error;
                }
                if (!response.ok) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Dev.to publish failed with HTTP ${response.status}`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                const externalId = raw && typeof raw === "object" && "id" in raw ? String(raw.id) : void 0;
                return {
                  success: true,
                  externalId,
                  statusCode: response.status,
                  message: "Published to Dev.to as draft",
                  idempotencyKey: options.idempotencyKey,
                  raw
                };
              } finally {
                clearTimeout(timer);
              }
            },
            {
              maxAttempts: appConfig.retry.maxAttempts,
              baseDelayMs: appConfig.retry.baseDelayMs,
              onRetry: (error, attempt, delayMs) => {
                logger.warn("Retrying Dev.to publish", {
                  attempt,
                  delayMs,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          );
          return result;
        } catch (error) {
          const status = error.status;
          return {
            success: false,
            statusCode: status,
            message: error instanceof Error ? error.message : "Dev.to publish failed",
            idempotencyKey: options.idempotencyKey
          };
        }
      }
    };
  }
});

// src/providers/publishing/hashnode.ts
var PUBLISH_POST_MUTATION, HashnodePublisher;
var init_hashnode = __esm({
  "src/providers/publishing/hashnode.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_retry();
    PUBLISH_POST_MUTATION = `
  mutation PublishPost($input: PublishPostInput!) {
    publishPost(input: $input) {
      post {
        id
        slug
        url
      }
    }
  }
`;
    HashnodePublisher = class {
      name = "hashnode";
      get token() {
        return appConfig.publishing.hashnode.token;
      }
      get publicationId() {
        return appConfig.publishing.hashnode.publicationId;
      }
      get canonicalBase() {
        return appConfig.publishing.hashnode.canonicalBase;
      }
      async publish(blog, options) {
        if (!this.token || !this.publicationId) {
          return {
            success: false,
            message: "HASHNODE_TOKEN or HASHNODE_PUBLICATION_ID is not configured",
            statusCode: 401,
            idempotencyKey: options.idempotencyKey
          };
        }
        try {
          const result = await withRetry(
            async () => {
              const tags = blog.tags.slice(0, 5).map((t) => ({
                slug: t.toLowerCase().replace(/\s+/g, "-"),
                name: t
              }));
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
              try {
                const response = await fetch("https://gql.hashnode.com", {
                  method: "POST",
                  signal: controller.signal,
                  headers: {
                    Authorization: this.token,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    query: PUBLISH_POST_MUTATION,
                    variables: {
                      input: {
                        title: blog.title,
                        contentMarkdown: blog.content,
                        tags,
                        subtitle: blog.excerpt,
                        publicationId: this.publicationId,
                        slug: blog.slug,
                        ...blog.featuredImage ? { coverImageOptions: { coverImageURL: blog.featuredImage } } : {},
                        ...this.canonicalBase ? { originalArticleURL: `${this.canonicalBase.replace(/\/$/, "")}/${blog.slug}` } : {}
                      }
                    }
                  })
                });
                const text = await response.text();
                let raw = text;
                try {
                  raw = text ? JSON.parse(text) : null;
                } catch {
                }
                if (response.status === 401 || response.status === 403) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Hashnode auth failed (${response.status})`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                if (response.status === 429 || response.status >= 500) {
                  const error = new Error(`Hashnode temporary error ${response.status}`);
                  error.status = response.status;
                  throw error;
                }
                if (!response.ok) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Hashnode publish failed with HTTP ${response.status}`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                const body = raw;
                if (body.errors?.length) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `Hashnode GraphQL error: ${body.errors[0].message}`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                const postId = body.data?.publishPost?.post?.id;
                return {
                  success: true,
                  externalId: postId,
                  statusCode: response.status,
                  message: "Published to Hashnode",
                  idempotencyKey: options.idempotencyKey,
                  raw
                };
              } finally {
                clearTimeout(timer);
              }
            },
            {
              maxAttempts: appConfig.retry.maxAttempts,
              baseDelayMs: appConfig.retry.baseDelayMs,
              onRetry: (error, attempt, delayMs) => {
                logger.warn("Retrying Hashnode publish", {
                  attempt,
                  delayMs,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          );
          return result;
        } catch (error) {
          const status = error.status;
          return {
            success: false,
            statusCode: status,
            message: error instanceof Error ? error.message : "Hashnode publish failed",
            idempotencyKey: options.idempotencyKey
          };
        }
      }
    };
  }
});

// src/providers/publishing/wordpress.ts
var WordPressPublisher;
var init_wordpress = __esm({
  "src/providers/publishing/wordpress.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_retry();
    WordPressPublisher = class {
      name = "wordpress";
      get url() {
        return appConfig.publishing.wordpress.url;
      }
      get user() {
        return appConfig.publishing.wordpress.user;
      }
      get appPassword() {
        return appConfig.publishing.wordpress.appPassword;
      }
      getAuthHeader() {
        const credentials = Buffer.from(`${this.user}:${this.appPassword}`).toString("base64");
        return `Basic ${credentials}`;
      }
      async publish(blog, options) {
        if (!this.url || !this.user || !this.appPassword) {
          return {
            success: false,
            message: "WordPress credentials (WORDPRESS_URL, WORDPRESS_USER, WORDPRESS_APP_PASSWORD) not configured",
            statusCode: 401,
            idempotencyKey: options.idempotencyKey
          };
        }
        try {
          const result = await withRetry(
            async () => {
              const endpoint = `${this.url.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);
              try {
                const response = await fetch(endpoint, {
                  method: "POST",
                  signal: controller.signal,
                  headers: {
                    Authorization: this.getAuthHeader(),
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    title: blog.title,
                    content: blog.content,
                    excerpt: blog.excerpt,
                    slug: blog.slug,
                    status: "draft"
                  })
                });
                const text = await response.text();
                let raw = text;
                try {
                  raw = text ? JSON.parse(text) : null;
                } catch {
                }
                if (response.status === 401 || response.status === 403) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `WordPress auth failed (${response.status})`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                if (response.status === 400 || response.status === 404 || response.status === 422) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `WordPress validation error (${response.status})`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                if (response.status === 429 || response.status >= 500) {
                  const error = new Error(`WordPress temporary error ${response.status}`);
                  error.status = response.status;
                  throw error;
                }
                if (!response.ok) {
                  return {
                    success: false,
                    statusCode: response.status,
                    message: `WordPress publish failed with HTTP ${response.status}`,
                    idempotencyKey: options.idempotencyKey,
                    raw
                  };
                }
                const externalId = raw && typeof raw === "object" && "id" in raw ? String(raw.id) : void 0;
                return {
                  success: true,
                  externalId,
                  statusCode: response.status,
                  message: "Published to WordPress as draft",
                  idempotencyKey: options.idempotencyKey,
                  raw
                };
              } finally {
                clearTimeout(timer);
              }
            },
            {
              maxAttempts: appConfig.retry.maxAttempts,
              baseDelayMs: appConfig.retry.baseDelayMs,
              onRetry: (error, attempt, delayMs) => {
                logger.warn("Retrying WordPress publish", {
                  attempt,
                  delayMs,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          );
          return result;
        } catch (error) {
          const status = error.status;
          return {
            success: false,
            statusCode: status,
            message: error instanceof Error ? error.message : "WordPress publish failed",
            idempotencyKey: options.idempotencyKey
          };
        }
      }
    };
  }
});

// src/providers/publishing/substack.ts
function toEmailHtml(blog) {
  const lines = [
    "<!DOCTYPE html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(blog.title)}</title>`,
    "<style>body{font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:20px;line-height:1.7;color:#1a1a1a}",
    "h1{font-size:28px}h2{font-size:22px}h3{font-size:18px}",
    "img{max-width:100%;height:auto}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:16px;color:#555}",
    "a{color:#0066cc}</style></head><body>"
  ];
  if (blog.featuredImage) {
    lines.push(`<img src="${escapeHtml(blog.featuredImage)}" alt="${escapeHtml(blog.title)}" />`);
  }
  lines.push(`<h1>${escapeHtml(blog.title)}</h1>`);
  lines.push(`<p><em>${escapeHtml(blog.excerpt)}</em></p>`);
  lines.push("<hr>");
  lines.push(blog.content);
  if (blog.sources.length > 0) {
    lines.push("<hr><h3>Sources</h3><ul>");
    for (const s of blog.sources) {
      lines.push(`<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.title)}</a></li>`);
    }
    lines.push("</ul>");
  }
  lines.push("</body></html>");
  return lines.join("\n");
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var SubstackPublisher;
var init_substack = __esm({
  "src/providers/publishing/substack.ts"() {
    "use strict";
    init_config();
    SubstackPublisher = class {
      name = "substack";
      get draftsDir() {
        return appConfig.publishing.substack.draftsDir;
      }
      async publish(blog, options) {
        try {
          const filename = `${blog.slug}.html`;
          const html = toEmailHtml(blog);
          return {
            success: true,
            statusCode: 200,
            message: `Substack HTML generated successfully. Download and manually upload.`,
            idempotencyKey: options.idempotencyKey,
            raw: {
              html,
              filename
            }
          };
        } catch (error) {
          return {
            success: false,
            message: error instanceof Error ? error.message : "Substack draft export failed",
            idempotencyKey: options.idempotencyKey
          };
        }
      }
    };
  }
});

// src/providers/publishing/index.ts
function createPublisher(override) {
  if (override === "mock") return new MockPublisher();
  if (override === "spanwrap") return new SpanwrapPublisher();
  if (process.env.PUBLISHER === "mock" || !appConfig.spanwrap.apiKey) {
    return new MockPublisher();
  }
  return new SpanwrapPublisher();
}
function createPublisherForTarget(target) {
  switch (target) {
    case "spanwrap":
      return createPublisher();
    case "medium":
      return new MediumPublisher();
    case "devto":
      return new DevtoPublisher();
    case "hashnode":
      return new HashnodePublisher();
    case "wordpress":
      return new WordPressPublisher();
    case "substack":
      return new SubstackPublisher();
    default:
      throw new Error(`Unknown publish target: ${target}`);
  }
}
var init_publishing = __esm({
  "src/providers/publishing/index.ts"() {
    "use strict";
    init_config();
    init_mock2();
    init_spanwrap();
    init_medium();
    init_devto();
    init_hashnode();
    init_wordpress();
    init_substack();
    init_mock2();
    init_spanwrap();
    init_medium();
    init_devto();
    init_hashnode();
    init_wordpress();
    init_substack();
  }
});

// src/services/file-store.ts
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path3 from "node:path";
var FileRunStore;
var init_file_store = __esm({
  "src/services/file-store.ts"() {
    "use strict";
    init_config();
    init_models();
    FileRunStore = class {
      constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
      }
      rootDir;
      runsDir() {
        return path3.join(this.rootDir, "runs");
      }
      runPath(id) {
        return path3.join(this.runsDir(), `${id}.json`);
      }
      async ensureReady() {
        await mkdir(this.runsDir(), { recursive: true });
      }
      async save(run) {
        await this.ensureReady();
        const parsed = PipelineRunSchema.parse({
          ...run,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        await writeFile(this.runPath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
        return parsed;
      }
      async get(id) {
        try {
          const raw = await readFile(this.runPath(id), "utf8");
          return PipelineRunSchema.parse(JSON.parse(raw));
        } catch (error) {
          const code = error.code;
          if (code === "ENOENT") return null;
          throw error;
        }
      }
      async require(id) {
        const run = await this.get(id);
        if (!run) throw new Error(`Pipeline run not found: ${id}`);
        return run;
      }
      async delete(id) {
        try {
          const { rm } = await import("node:fs/promises");
          await rm(this.runPath(id));
          return true;
        } catch (error) {
          const code = error.code;
          if (code === "ENOENT") return false;
          throw error;
        }
      }
      async list() {
        await this.ensureReady();
        const files = await readdir(this.runsDir());
        const runs = [];
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          const raw = await readFile(path3.join(this.runsDir(), file), "utf8");
          runs.push(PipelineRunSchema.parse(JSON.parse(raw)));
        }
        return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
    };
  }
});

// src/services/mongo-store.ts
var MongoRunStore;
var init_mongo_store = __esm({
  "src/services/mongo-store.ts"() {
    "use strict";
    init_models();
    init_mongo_connection();
    MongoRunStore = class {
      constructor(uri, dbName = "spanwrap_pipeline", collectionName = "pipeline_runs") {
        this.uri = uri;
        this.dbName = dbName;
        this.collectionName = collectionName;
      }
      uri;
      dbName;
      collectionName;
      client = null;
      collection = null;
      connecting = null;
      async ensureConnected() {
        if (this.collection) return this.collection;
        if (!this.connecting) {
          this.connecting = (async () => {
            try {
              const { client, db } = await connectMongo(this.uri, this.dbName);
              const col = db.collection(this.collectionName);
              await col.createIndex({ updatedAt: -1 });
              await col.createIndex({ status: 1 });
              this.client = client;
              this.collection = col;
              return col;
            } catch (error) {
              this.client = null;
              this.collection = null;
              this.connecting = null;
              throw error instanceof Error ? error : new Error(formatMongoError(error));
            }
          })();
        }
        return this.connecting;
      }
      filterById(id) {
        return { _id: id };
      }
      docToRun(doc) {
        const raw = doc;
        const { _id, ...rest } = raw;
        return PipelineRunSchema.parse({ ...rest, id: String(_id) });
      }
      async save(run) {
        const parsed = PipelineRunSchema.parse({
          ...run,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        const col = await this.ensureConnected();
        const doc = {
          ...parsed,
          _id: parsed.id
        };
        await col.replaceOne(this.filterById(parsed.id), doc, { upsert: true });
        return parsed;
      }
      async get(id) {
        const col = await this.ensureConnected();
        const doc = await col.findOne(this.filterById(id));
        if (!doc) return null;
        return this.docToRun(doc);
      }
      async require(id) {
        const run = await this.get(id);
        if (!run) throw new Error(`Pipeline run not found: ${id}`);
        return run;
      }
      async delete(id) {
        const col = await this.ensureConnected();
        const result = await col.deleteOne(this.filterById(id));
        return result.deletedCount > 0;
      }
      async list() {
        const col = await this.ensureConnected();
        const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
        return docs.map((doc) => this.docToRun(doc));
      }
      async close() {
        if (this.client) {
          await this.client.close();
          this.client = null;
          this.collection = null;
          this.connecting = null;
        }
      }
    };
  }
});

// src/services/storage.ts
function createRunStore(backend = appConfig.storage.backend) {
  if (backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) {
      throw new Error(
        process.env.VERCEL ? "Vercel deploys need MONGODB_URI (Atlas). File storage is ephemeral on serverless." : "STORAGE_BACKEND=mongodb requires MONGODB_URI (e.g. mongodb://127.0.0.1:27017)"
      );
    }
    return new MongoRunStore(
      uri,
      appConfig.storage.mongoDb,
      appConfig.storage.mongoCollection
    );
  }
  return new FileRunStore(appConfig.dataDir);
}
function getRunStore() {
  if (!defaultStore) {
    defaultStore = createRunStore();
  }
  return defaultStore;
}
var defaultStore;
var init_storage = __esm({
  "src/services/storage.ts"() {
    "use strict";
    init_config();
    init_file_store();
    init_mongo_store();
    init_file_store();
    init_mongo_store();
    defaultStore = null;
  }
});

// src/utils/idempotency.ts
import { createHash, randomUUID } from "node:crypto";
function createId(prefix = "run") {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
function createIdempotencyKey(parts) {
  return createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 32);
}
var init_idempotency = __esm({
  "src/utils/idempotency.ts"() {
    "use strict";
  }
});

// src/services/file-template-store.ts
import { mkdir as mkdir2, readdir as readdir2, readFile as readFile2, unlink, writeFile as writeFile2 } from "node:fs/promises";
import path4 from "node:path";
var FileTemplateStore;
var init_file_template_store = __esm({
  "src/services/file-template-store.ts"() {
    "use strict";
    init_config();
    init_models();
    FileTemplateStore = class {
      constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
      }
      rootDir;
      dir() {
        return path4.join(this.rootDir, "templates");
      }
      filePath(id) {
        return path4.join(this.dir(), `${id}.json`);
      }
      async ensureReady() {
        await mkdir2(this.dir(), { recursive: true });
      }
      async save(template) {
        await this.ensureReady();
        const parsed = ArticleTemplateSchema.parse({
          ...template,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        await writeFile2(this.filePath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
        return parsed;
      }
      async get(id) {
        try {
          const raw = await readFile2(this.filePath(id), "utf8");
          return ArticleTemplateSchema.parse(JSON.parse(raw));
        } catch (error) {
          const code = error.code;
          if (code === "ENOENT") return null;
          throw error;
        }
      }
      async require(id) {
        const t = await this.get(id);
        if (!t) throw new Error(`Template not found: ${id}`);
        return t;
      }
      async list() {
        await this.ensureReady();
        const files = await readdir2(this.dir());
        const out = [];
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          const raw = await readFile2(path4.join(this.dir(), file), "utf8");
          out.push(ArticleTemplateSchema.parse(JSON.parse(raw)));
        }
        return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      }
      async delete(id) {
        try {
          await unlink(this.filePath(id));
          return true;
        } catch (error) {
          const code = error.code;
          if (code === "ENOENT") return false;
          throw error;
        }
      }
    };
  }
});

// src/services/mongo-template-store.ts
var MongoTemplateStore;
var init_mongo_template_store = __esm({
  "src/services/mongo-template-store.ts"() {
    "use strict";
    init_config();
    init_models();
    init_mongo_connection();
    MongoTemplateStore = class {
      constructor(uri, dbName = appConfig.storage.mongoDb, collectionName = "article_templates") {
        this.uri = uri;
        this.dbName = dbName;
        this.collectionName = collectionName;
      }
      uri;
      dbName;
      collectionName;
      client = null;
      collection = null;
      connecting = null;
      async ensureConnected() {
        if (this.collection) return this.collection;
        if (!this.connecting) {
          this.connecting = (async () => {
            try {
              const { client, db } = await connectMongo(this.uri, this.dbName);
              const col = db.collection(this.collectionName);
              await col.createIndex({ updatedAt: -1 });
              await col.createIndex({ name: 1 });
              this.client = client;
              this.collection = col;
              return col;
            } catch (error) {
              this.client = null;
              this.collection = null;
              this.connecting = null;
              throw error instanceof Error ? error : new Error(formatMongoError(error));
            }
          })();
        }
        return this.connecting;
      }
      filterById(id) {
        return { _id: id };
      }
      docToTemplate(doc) {
        const raw = doc;
        const { _id, ...rest } = raw;
        return ArticleTemplateSchema.parse({ ...rest, id: String(_id) });
      }
      async save(template) {
        const parsed = ArticleTemplateSchema.parse({
          ...template,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        const col = await this.ensureConnected();
        const doc = { ...parsed, _id: parsed.id };
        await col.replaceOne(this.filterById(parsed.id), doc, { upsert: true });
        return parsed;
      }
      async get(id) {
        const col = await this.ensureConnected();
        const doc = await col.findOne(this.filterById(id));
        if (!doc) return null;
        return this.docToTemplate(doc);
      }
      async require(id) {
        const t = await this.get(id);
        if (!t) throw new Error(`Template not found: ${id}`);
        return t;
      }
      async list() {
        const col = await this.ensureConnected();
        const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
        return docs.map((d) => this.docToTemplate(d));
      }
      async delete(id) {
        const col = await this.ensureConnected();
        const result = await col.deleteOne(this.filterById(id));
        return (result.deletedCount ?? 0) > 0;
      }
      async close() {
        if (this.client) {
          await this.client.close();
          this.client = null;
          this.collection = null;
          this.connecting = null;
        }
      }
    };
  }
});

// src/services/templates.ts
function createTemplateStore(backend = appConfig.storage.backend) {
  if (backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) {
      throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI for templates");
    }
    return new MongoTemplateStore(uri, appConfig.storage.mongoDb, "article_templates");
  }
  return new FileTemplateStore(appConfig.dataDir);
}
function getTemplateStore() {
  if (!defaultTemplateStore) {
    defaultTemplateStore = createTemplateStore();
  }
  return defaultTemplateStore;
}
async function uploadTemplate(input, store = getTemplateStore()) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const template = ArticleTemplateSchema.parse({
    id: input.id ?? createId("tpl"),
    name: input.name.trim() || input.filename?.replace(/\.md$/i, "") || "Untitled template",
    filename: input.filename ?? "",
    markdown: input.markdown.trim(),
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now
  });
  if (template.markdown.length < 20) {
    throw new Error("Template markdown is too short");
  }
  if (!template.markdown.includes("#") && !template.markdown.includes("{{")) {
  }
  return store.save(template);
}
var defaultTemplateStore;
var init_templates = __esm({
  "src/services/templates.ts"() {
    "use strict";
    init_config();
    init_models();
    init_idempotency();
    init_file_template_store();
    init_mongo_template_store();
    init_file_template_store();
    init_mongo_template_store();
    defaultTemplateStore = null;
  }
});

// src/providers/research/mock.ts
var MockResearchProvider;
var init_mock3 = __esm({
  "src/providers/research/mock.ts"() {
    "use strict";
    MockResearchProvider = class {
      name = "mock-research";
      async discover(brief) {
        const keyword = brief.keywords[0] ?? brief.topic;
        const refs = (brief.referenceUrls ?? []).map((url, i) => ({
          url,
          title: `Reference ${i + 1}`,
          snippet: brief.topic,
          relevanceScore: 0.95
        }));
        return [
          ...refs,
          {
            url: "https://example.com/ai-agents-support-foundations",
            title: `${keyword}: foundations`,
            snippet: `Overview of ${brief.topic} for ${brief.targetAudience}.`,
            relevanceScore: 0.9
          },
          {
            url: "https://example.com/support-automation-tradeoffs",
            title: "Support automation trade-offs",
            snippet: "Where automation helps and where human judgment is required.",
            relevanceScore: 0.85
          },
          {
            url: "https://example.com/agent-eval-playbook",
            title: "Agent evaluation playbook",
            snippet: "How to measure resolution quality and escalation health.",
            relevanceScore: 0.82
          }
        ];
      }
    };
  }
});

// src/utils/url.ts
function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = "";
  const drop = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
  for (const key of drop) url.searchParams.delete(key);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
function sourceNameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
function assertSafeUrl(value) {
  if (!isValidHttpUrl(value)) {
    throw new Error(`Invalid URL: ${value}`);
  }
  const url = new URL(value);
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    if (process.env.ALLOW_PRIVATE_URLS !== "1") {
      throw new Error(`Private/local URLs are not allowed: ${host}`);
    }
  }
  return url;
}
var init_url = __esm({
  "src/utils/url.ts"() {
    "use strict";
  }
});

// src/providers/research/web-search.ts
var SerperResearchProvider, TavilyResearchProvider;
var init_web_search = __esm({
  "src/providers/research/web-search.ts"() {
    "use strict";
    init_config();
    init_url();
    SerperResearchProvider = class {
      constructor(apiKey = appConfig.research.serperApiKey) {
        this.apiKey = apiKey;
        if (!this.apiKey) throw new Error("SERPER_API_KEY is required for Serper provider");
      }
      apiKey;
      name = "serper";
      async discover(brief) {
        const query = [brief.topic, ...brief.keywords].filter(Boolean).join(" ");
        const response = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "X-API-KEY": this.apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ q: query, num: appConfig.maxSources })
        });
        if (!response.ok) {
          const error = new Error(`Serper HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        const data = await response.json();
        return (data.organic ?? []).filter((r) => r.link && isValidHttpUrl(r.link)).map((r, index) => ({
          url: r.link,
          title: r.title,
          snippet: r.snippet,
          relevanceScore: Math.max(0.5, 0.95 - index * 0.05)
        }));
      }
    };
    TavilyResearchProvider = class {
      constructor(apiKey = appConfig.research.tavilyApiKey) {
        this.apiKey = apiKey;
        if (!this.apiKey) throw new Error("TAVILY_API_KEY is required for Tavily provider");
      }
      apiKey;
      name = "tavily";
      async discover(brief) {
        const query = [brief.topic, ...brief.keywords].filter(Boolean).join(" ");
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: this.apiKey,
            query,
            max_results: appConfig.maxSources,
            include_answer: false
          })
        });
        if (!response.ok) {
          const error = new Error(`Tavily HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        const data = await response.json();
        return (data.results ?? []).filter((r) => r.url && isValidHttpUrl(r.url)).map((r) => ({
          url: r.url,
          title: r.title,
          snippet: r.content,
          relevanceScore: typeof r.score === "number" ? Math.min(1, Math.max(0, r.score)) : 0.7
        }));
      }
    };
  }
});

// src/providers/research/direct-url.ts
var DirectURLProvider;
var init_direct_url = __esm({
  "src/providers/research/direct-url.ts"() {
    "use strict";
    DirectURLProvider = class {
      name = "direct-url";
      async discover(brief) {
        return (brief.referenceUrls ?? []).map((url, index) => ({
          url,
          title: `Reference ${index + 1}`,
          snippet: brief.topic,
          relevanceScore: 0.95
        }));
      }
    };
  }
});

// src/providers/research/index.ts
function createResearchProvider(override) {
  const mode = override ?? appConfig.research.provider;
  if (mode === "mock") return new MockResearchProvider();
  if (mode === "serper") return new SerperResearchProvider();
  if (mode === "tavily") return new TavilyResearchProvider();
  if (appConfig.research.serperApiKey) return new SerperResearchProvider();
  if (appConfig.research.tavilyApiKey) return new TavilyResearchProvider();
  return new MockResearchProvider();
}
var init_research = __esm({
  "src/providers/research/index.ts"() {
    "use strict";
    init_config();
    init_mock3();
    init_web_search();
    init_direct_url();
    init_mock3();
    init_web_search();
  }
});

// src/services/extraction.ts
import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
async function fetchText(url, timeoutMs = appConfig.requestTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": appConfig.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} fetching ${url}`);
      error.status = response.status;
      throw error;
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
async function isAllowedByRobots(pageUrl) {
  if (!appConfig.respectRobotsTxt) return true;
  try {
    const url = assertSafeUrl(pageUrl);
    const robotsUrl = `${url.origin}/robots.txt`;
    let robots = robotsCache.get(url.origin);
    if (!robots) {
      try {
        const body = await fetchText(robotsUrl, 1e4);
        robots = robotsParser(robotsUrl, body);
      } catch {
        robots = robotsParser(robotsUrl, "");
      }
      robotsCache.set(url.origin, robots);
    }
    return robots.isAllowed(pageUrl, appConfig.userAgent) !== false;
  } catch {
    return true;
  }
}
function normalizeWhitespace(text) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
function extractMainContent($) {
  $("body").find(REMOVE_SELECTORS).remove();
  const candidates = [
    "article",
    "main",
    "[role='main']",
    ".post-content",
    ".article-content",
    ".entry-content",
    "#content",
    ".content"
  ];
  let rootSelector = "body";
  for (const sel of candidates) {
    const node = $(sel).first();
    if (node.length && node.text().trim().length > 200) {
      rootSelector = sel;
      break;
    }
  }
  const root = $(rootSelector).first();
  const parts = [];
  root.find("h1,h2,h3,h4,p,li,blockquote,pre").each((_, el) => {
    const tag = "tagName" in el && typeof el.tagName === "string" ? el.tagName.toLowerCase() : "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) return;
    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
      parts.push(`
## ${text}
`);
    } else if (tag === "li") {
      parts.push(`- ${text}`);
    } else if (tag === "blockquote") {
      parts.push(`> ${text}`);
    } else {
      parts.push(text);
    }
  });
  if (parts.length === 0) {
    return normalizeWhitespace(root.text());
  }
  return normalizeWhitespace(parts.join("\n\n"));
}
function extractFromHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const title = $("meta[property='og:title']").attr("content")?.trim() || $("title").first().text().trim() || $("h1").first().text().trim() || "Untitled";
  const publishedAt = $("meta[property='article:published_time']").attr("content") || $("time[datetime]").attr("datetime") || null;
  const content = extractMainContent($);
  const sourceName = new URL(pageUrl).hostname.replace(/^www\./, "");
  return {
    url: normalizeUrl(pageUrl),
    title,
    sourceName,
    content,
    publishedAt
  };
}
async function fetchAndExtract(pageUrl) {
  const url = assertSafeUrl(pageUrl).toString();
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    throw new Error(`Blocked by robots.txt: ${url}`);
  }
  const html = await withRetry(
    async () => fetchText(url),
    {
      maxAttempts: appConfig.retry.maxAttempts,
      baseDelayMs: appConfig.retry.baseDelayMs,
      shouldRetry: (error) => {
        const status = error.status;
        if (status === 404 || status === 401 || status === 403) return false;
        return true;
      },
      onRetry: (error, attempt, delayMs) => {
        logger.warn("Retrying page fetch", {
          url,
          attempt,
          delayMs,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );
  const extracted = extractFromHtml(html, url);
  if (!extracted.content || extracted.content.length < 40) {
    throw new Error(`Empty or insufficient content extracted from ${url}`);
  }
  return extracted;
}
var REMOVE_SELECTORS, robotsCache;
var init_extraction = __esm({
  "src/services/extraction.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_retry();
    init_url();
    REMOVE_SELECTORS = [
      "script",
      "style",
      "noscript",
      "iframe",
      "nav",
      "footer",
      "header",
      "aside",
      "form",
      ".nav",
      ".navbar",
      ".footer",
      ".header",
      ".sidebar",
      ".advertisement",
      ".ads",
      ".ad",
      ".cookie",
      ".social",
      ".share",
      ".newsletter",
      "[role='navigation']",
      "[role='banner']",
      "[role='contentinfo']"
    ].join(",");
    robotsCache = /* @__PURE__ */ new Map();
  }
});

// src/pipeline/stages/research.ts
function scoreRelevance(brief, d, content) {
  const base = d.relevanceScore ?? 0.5;
  const hay = `${d.title ?? ""} ${d.snippet ?? ""} ${content}`.toLowerCase();
  const terms = [brief.topic, ...brief.keywords].map((t) => t.toLowerCase()).filter(Boolean);
  const hits = terms.filter((t) => hay.includes(t)).length;
  const boost = terms.length ? hits / terms.length : 0;
  return Math.min(1, Number((base * 0.7 + boost * 0.3).toFixed(3)));
}
function dedupeDiscoveries(items) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of items) {
    try {
      const key = normalizeUrl(item.url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...item, url: key });
    } catch {
    }
  }
  return out;
}
async function researchStage(brief, options = {}) {
  const primary = options.researchProvider ?? createResearchProvider();
  const direct = new DirectURLProvider();
  const discovered = dedupeDiscoveries([
    ...await direct.discover(brief),
    ...await primary.discover(brief)
  ]).slice(0, appConfig.maxSources);
  logger.info("Research discoveries collected", {
    count: discovered.length,
    provider: primary.name
  });
  const sources = [];
  const concurrency = Math.max(1, appConfig.maxFetchConcurrency);
  for (let i = 0; i < discovered.length; i += concurrency) {
    const batch = discovered.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (item) => {
        const id = createId("source");
        if (options.offlineExtract || primary.name.includes("mock")) {
          const synthetic = [
            item.title ?? brief.topic,
            item.snippet ?? "",
            `This source discusses ${brief.topic} for ${brief.targetAudience}.`,
            brief.keywords.map((k) => `Keyword context: ${k}.`).join(" ")
          ].filter(Boolean).join("\n\n");
          return {
            id,
            url: item.url,
            title: item.title ?? brief.topic,
            sourceName: sourceNameFromUrl(item.url),
            content: synthetic,
            publishedAt: null,
            relevanceScore: scoreRelevance(brief, item, synthetic)
          };
        }
        try {
          const page = await fetchAndExtract(item.url);
          return {
            id,
            url: page.url,
            title: page.title || item.title || brief.topic,
            sourceName: page.sourceName,
            content: page.content,
            publishedAt: page.publishedAt,
            relevanceScore: scoreRelevance(brief, item, page.content)
          };
        } catch (error) {
          logger.warn("Source extraction failed", {
            url: item.url,
            error: error instanceof Error ? error.message : String(error)
          });
          return {
            id,
            url: item.url,
            title: item.title ?? item.url,
            sourceName: sourceNameFromUrl(item.url),
            content: item.snippet ?? "",
            publishedAt: null,
            relevanceScore: item.relevanceScore ?? 0.3,
            fetchError: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    sources.push(...results);
  }
  const ranked = sources.filter((s) => s.content.trim().length > 0).sort((a, b) => b.relevanceScore - a.relevanceScore);
  const final = [];
  const seen = /* @__PURE__ */ new Set();
  for (const s of ranked) {
    const key = normalizeUrl(s.url);
    if (seen.has(key)) continue;
    seen.add(key);
    final.push(s);
  }
  if (final.length === 0) {
    throw new Error("Research produced no usable sources");
  }
  return { sources: final, providerName: primary.name };
}
var init_research2 = __esm({
  "src/pipeline/stages/research.ts"() {
    "use strict";
    init_config();
    init_research();
    init_extraction();
    init_logger();
    init_idempotency();
    init_url();
  }
});

// src/prompts/analysis/v1.ts
function buildAnalysisPrompt(input) {
  return `Research analysis for blog topic: "${input.topic}".

v=${ANALYSIS_PROMPT_VERSION}
Use ONLY these sources. Extract facts, stats, arguments, examples, viewpoints, terminology, quotes, and claims needing verification.

Rules:
- every claim must use real sourceIds from the list
- never invent IDs/URLs
- if unsure, lower confidence and use category verification_needed

Sources: ${input.sourcesJson}

Return JSON only:
{"summary":string,"claims":[{"claim":string,"sourceIds":string[],"confidence":number,"category":string}],"keyArguments":string[],"competingViewpoints":string[],"terminology":string[],"sourceRelationships":[{"sourceIds":string[],"relationship":string}]}`;
}
var ANALYSIS_PROMPT_VERSION;
var init_v1 = __esm({
  "src/prompts/analysis/v1.ts"() {
    "use strict";
    ANALYSIS_PROMPT_VERSION = "v1";
  }
});

// src/utils/prompt-budget.ts
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}
function truncateForPrompt(text, maxChars) {
  const cleaned = collapseWhitespace(text);
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}\u2026`;
}
function compactJson(value) {
  return JSON.stringify(value);
}
function getPromptBudget() {
  return {
    maxSources: appConfig.llm.promptMaxSources,
    analysisSourceChars: appConfig.llm.promptAnalysisSourceChars,
    generationSourceChars: appConfig.llm.promptGenerationSourceChars,
    maxClaims: appConfig.llm.promptMaxClaims,
    maxClaimChars: appConfig.llm.promptMaxClaimChars,
    maxTemplateChars: appConfig.llm.promptMaxTemplateChars,
    maxKeyPoints: appConfig.llm.promptMaxKeyPoints
  };
}
function pickSourcesForPrompt(sources, limit = getPromptBudget().maxSources) {
  return [...sources].filter((s) => !s.fetchError && s.content.trim().length > 40).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, Math.max(1, limit));
}
function compactBrief(brief) {
  return {
    topic: truncateForPrompt(brief.topic, 200),
    audience: truncateForPrompt(brief.targetAudience, 80),
    tone: truncateForPrompt(brief.tone, 60),
    type: truncateForPrompt(brief.contentType, 40),
    keywords: brief.keywords.slice(0, 8).map((k) => truncateForPrompt(k, 40))
  };
}
function compactSourcesForAnalysis(sources, budget = getPromptBudget()) {
  return pickSourcesForPrompt(sources, budget.maxSources).map((s) => ({
    id: s.id,
    title: truncateForPrompt(s.title, 120),
    url: s.url,
    source: truncateForPrompt(s.sourceName, 60),
    score: Number(s.relevanceScore.toFixed(2)),
    text: truncateForPrompt(s.content, budget.analysisSourceChars)
  }));
}
function compactSourcesForGeneration(sources, budget = getPromptBudget()) {
  return pickSourcesForPrompt(sources, budget.maxSources).map((s) => ({
    id: s.id,
    title: truncateForPrompt(s.title, 100),
    url: s.url,
    text: truncateForPrompt(s.content, budget.generationSourceChars)
  }));
}
function compactAnalysis(analysis, budget = getPromptBudget()) {
  const claims = [...analysis.claims].sort((a, b) => b.confidence - a.confidence).slice(0, budget.maxClaims).map((c) => ({
    claim: truncateForPrompt(c.claim, budget.maxClaimChars),
    sourceIds: c.sourceIds.slice(0, 3),
    confidence: Number(c.confidence.toFixed(2)),
    category: c.category
  }));
  return {
    summary: truncateForPrompt(analysis.summary, 500),
    claims,
    keyArguments: analysis.keyArguments.slice(0, 6).map((a) => truncateForPrompt(a, 160)),
    competingViewpoints: analysis.competingViewpoints.slice(0, 4).map((v) => truncateForPrompt(v, 140)),
    terminology: analysis.terminology.slice(0, 12).map((t) => truncateForPrompt(t, 40))
  };
}
function compactOutline(outline, budget = getPromptBudget()) {
  return {
    titles: outline.titleCandidates.slice(0, 3).map((t) => truncateForPrompt(t, 100)),
    sections: outline.sections.map((s) => ({
      heading: truncateForPrompt(s.heading, 100),
      purpose: truncateForPrompt(s.purpose, 160),
      keyPoints: s.keyPoints.slice(0, budget.maxKeyPoints).map((p) => truncateForPrompt(p, 120)),
      sourceIds: s.sourceIds.slice(0, 4)
    }))
  };
}
function compactTemplateForPrompt(templateMarkdown, budget = getPromptBudget()) {
  const raw = templateMarkdown.trim();
  if (!raw) return "";
  const headings = [...raw.matchAll(/^#{1,3}\s+.+$/gm)].map((m) => m[0].trim());
  const instructions = raw.split(/\n{2,}/).map((block) => collapseWhitespace(block)).filter((block) => block && !/^#{1,3}\s/.test(block)).slice(0, 8).map((block) => truncateForPrompt(block, 220));
  const compact = [
    headings.length ? `Sections:
${headings.slice(0, 16).join("\n")}` : "",
    instructions.length ? `Instructions:
- ${instructions.join("\n- ")}` : ""
  ].filter(Boolean).join("\n\n");
  if (compact.length >= 80) {
    return truncateForPrompt(compact, budget.maxTemplateChars);
  }
  return truncateForPrompt(raw, budget.maxTemplateChars);
}
var init_prompt_budget = __esm({
  "src/utils/prompt-budget.ts"() {
    "use strict";
    init_config();
  }
});

// src/pipeline/stages/analysis.ts
async function analysisStage(brief, sources, llm) {
  const payload = compactSourcesForAnalysis(sources);
  const prompt = buildAnalysisPrompt({
    topic: brief.topic,
    sourcesJson: compactJson(payload)
  });
  logger.info("Analysis prompt budget", {
    sources: payload.length,
    approxTokens: estimateTokens(prompt)
  });
  const analysis = await llm.generateStructured(prompt, ResearchAnalysisSchema);
  const known = new Set(payload.map((s) => String(s.id)));
  const claims = analysis.claims.map((c) => ({
    ...c,
    sourceIds: c.sourceIds.filter((id) => known.has(id))
  })).filter((c) => c.sourceIds.length > 0);
  return ResearchAnalysisSchema.parse({
    ...analysis,
    claims
  });
}
var init_analysis = __esm({
  "src/pipeline/stages/analysis.ts"() {
    "use strict";
    init_models();
    init_v1();
    init_prompt_budget();
    init_logger();
  }
});

// src/prompts/outline/v1.ts
function buildOutlinePrompt(input) {
  const templateBlock = input.templateMarkdown?.trim() ? `
Template (required sections/instructions):
${input.templateMarkdown}
- Follow template section order/headings.
` : "";
  return `Create a blog outline.

v=${OUTLINE_PROMPT_VERSION}
Brief: ${input.briefJson}
Analysis: ${input.analysisJson}
Allowed source IDs: ${input.sourceIds.join(",") || "(none)"}
${templateBlock}
Rules:
- section.sourceIds only from allowed IDs
- include intro/body/conclusion (or template sections)
- 3 title candidates; concrete key points

Return JSON only:
{"titleCandidates":string[],"sections":[{"heading":string,"purpose":string,"keyPoints":string[],"sourceIds":string[]}]}`;
}
var OUTLINE_PROMPT_VERSION;
var init_v12 = __esm({
  "src/prompts/outline/v1.ts"() {
    "use strict";
    OUTLINE_PROMPT_VERSION = "v1";
  }
});

// src/pipeline/stages/outline.ts
async function outlineStage(brief, sources, analysis, llm, templateMarkdown) {
  const selected = pickSourcesForPrompt(sources);
  const sourceIds = selected.map((s) => s.id);
  const known = new Set(sourceIds);
  const prompt = buildOutlinePrompt({
    briefJson: compactJson(compactBrief(brief)),
    analysisJson: compactJson(compactAnalysis(analysis)),
    sourceIds,
    templateMarkdown: templateMarkdown?.trim() ? compactTemplateForPrompt(templateMarkdown) : null
  });
  logger.info("Outline prompt budget", {
    sources: sourceIds.length,
    approxTokens: estimateTokens(prompt)
  });
  const outline = await llm.generateStructured(prompt, BlogOutlineSchema);
  const cleaned = {
    ...outline,
    titleCandidates: outline.titleCandidates.filter(Boolean).slice(0, 5),
    sections: outline.sections.map((section) => ({
      ...section,
      sourceIds: section.sourceIds.filter((id) => known.has(id))
    }))
  };
  return BlogOutlineSchema.parse(cleaned);
}
var init_outline = __esm({
  "src/pipeline/stages/outline.ts"() {
    "use strict";
    init_models();
    init_v12();
    init_prompt_budget();
    init_logger();
  }
});

// src/prompts/generation/v1.ts
function buildGenerationPrompt(input) {
  const templateBlock = input.templateGuidance ? `
${input.templateGuidance}
` : `
No template. Use intro, body from outline, conclusion.
`;
  return `Write an original blog article from the inputs below. Cite only provided sources.

v=${GENERATION_PROMPT_VERSION}

Brief: ${input.briefJson}
Outline: ${input.outlineJson}
Analysis: ${input.analysisJson}
Sources: ${input.sourcesJson}
${templateBlock}
Rules:
- grounded in sources only; no invented stats/citations
- clear structure; no filler/keyword stuffing
- follow template headings/instructions when provided
- featuredImage: https URL from sources when available
- embed at most 1 real https Markdown image when available

Return JSON only:
{"title":string,"subtitle":string,"slug":string,"excerpt":string,"content":string,"tags":string[],"keywords":string[],"seoTitle":string,"seoDescription":string,"featuredImage":string|null,"sources":[{"title":string,"url":string,"sourceName":string}],"sourceMap":[{"paragraphIndex":number,"sourceIds":string[]}]}`;
}
var GENERATION_PROMPT_VERSION;
var init_v13 = __esm({
  "src/prompts/generation/v1.ts"() {
    "use strict";
    GENERATION_PROMPT_VERSION = "v1";
  }
});

// src/utils/images.ts
function extractMarkdownImageUrls(markdown) {
  const urls = [];
  const re = new RegExp(MD_IMAGE.source, "gi");
  let match;
  while (match = re.exec(markdown)) {
    const url = match[1]?.trim();
    if (url && isValidHttpUrl(url)) urls.push(url);
  }
  return urls;
}
function githubOpenGraphImage(url) {
  try {
    const parsed = new URL(url);
    if (!/^(www\.)?github\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `https://opengraph.githubassets.com/1/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}
function resolveFeaturedImage(input) {
  const explicit = input.featuredImage?.trim();
  if (explicit && isValidHttpUrl(explicit)) return explicit;
  const fromBody = extractMarkdownImageUrls(input.content ?? "")[0];
  if (fromBody) return fromBody;
  for (const url of input.sourceUrls ?? []) {
    const og = githubOpenGraphImage(url);
    if (og) return og;
  }
  return null;
}
var MD_IMAGE;
var init_images = __esm({
  "src/utils/images.ts"() {
    "use strict";
    init_url();
    MD_IMAGE = /!\[[^\]]*]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi;
  }
});

// src/utils/template.ts
function templateHasPlaceholders(markdown) {
  return listPlaceholders(markdown).length > 0;
}
function listPlaceholders(markdown) {
  const found = /* @__PURE__ */ new Set();
  for (const match of markdown.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}
function formatSources(sources = []) {
  if (!sources.length) return "";
  return sources.map((s) => {
    const label = s.sourceName ? `${s.title} (${s.sourceName})` : s.title;
    return `- [${label}](${s.url})`;
  }).join("\n");
}
function applyMarkdownTemplate(templateMarkdown, values) {
  if (!templateHasPlaceholders(templateMarkdown)) {
    return values.body;
  }
  const map = {
    title: values.title,
    subtitle: values.subtitle ?? "",
    slug: values.slug ?? "",
    excerpt: values.excerpt ?? "",
    seoTitle: values.seoTitle ?? values.title,
    seoDescription: values.seoDescription ?? values.excerpt ?? "",
    tags: (values.tags ?? []).join(", "),
    keywords: (values.keywords ?? []).join(", "),
    body: values.body,
    sources: formatSources(values.sources)
  };
  return templateMarkdown.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return map[key] ?? "";
    }
    return full;
  });
}
function describeTemplateForPrompt(templateMarkdown) {
  const placeholders = listPlaceholders(templateMarkdown);
  const compact = compactTemplateForPrompt(templateMarkdown);
  const lines = [
    "TEMPLATE",
    "Headings = required sections. Other prose = writing instructions.",
    compact
  ];
  if (placeholders.length) {
    lines.push(
      `Placeholders: ${placeholders.map((p) => `{{${p}}}`).join(", ")}`,
      "Fill research substance into {{body}} / matching structure; keep section order."
    );
  } else {
    lines.push(
      "Mirror heading order and style. Replace example prose with research-backed writing.",
      "`content` must be Markdown following this structure."
    );
  }
  return lines.join("\n");
}
var init_template = __esm({
  "src/utils/template.ts"() {
    "use strict";
    init_prompt_budget();
  }
});

// src/pipeline/stages/generation.ts
async function generationStage(brief, sources, analysis, outline, llm, templateMarkdown) {
  const selected = pickSourcesForPrompt(sources);
  const known = new Set(selected.map((s) => s.id));
  const sourcesJson = compactJson(compactSourcesForGeneration(selected));
  const templateGuidance = templateMarkdown?.trim() ? describeTemplateForPrompt(templateMarkdown) : null;
  const prompt = buildGenerationPrompt({
    briefJson: compactJson(compactBrief(brief)),
    outlineJson: compactJson(compactOutline(outline)),
    analysisJson: compactJson(compactAnalysis(analysis)),
    sourcesJson,
    templateGuidance
  });
  logger.info("Generation prompt budget", {
    sources: selected.length,
    approxTokens: estimateTokens(prompt)
  });
  const article = await llm.generateStructured(prompt, GeneratedBlogSchema);
  const slug = article.slug ? toSlug(article.slug) : toSlug(article.title);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const listed = article.sources.length > 0 ? article.sources : selected.map((s) => ({
    title: s.title,
    url: s.url,
    sourceName: s.sourceName
  }));
  const sourceMap = (article.sourceMap ?? []).map((m) => ({
    ...m,
    sourceIds: m.sourceIds.filter((id) => known.has(id))
  })).filter((m) => m.sourceIds.length > 0);
  const cleanedSources = listed.map((s) => {
    const match = [...sourceById.values()].find((r) => r.url === s.url);
    return {
      title: s.title || match?.title || s.url,
      url: s.url,
      sourceName: s.sourceName || match?.sourceName
    };
  });
  let content = article.content;
  if (templateMarkdown?.trim() && templateHasPlaceholders(templateMarkdown)) {
    content = applyMarkdownTemplate(templateMarkdown, {
      title: article.title,
      subtitle: article.subtitle,
      slug,
      excerpt: article.excerpt,
      seoTitle: article.seoTitle || article.title,
      seoDescription: article.seoDescription || article.excerpt,
      tags: article.tags,
      keywords: article.keywords,
      body: article.content,
      sources: cleanedSources
    });
  }
  return GeneratedBlogSchema.parse({
    ...article,
    slug,
    content,
    seoTitle: article.seoTitle || article.title,
    seoDescription: article.seoDescription || article.excerpt,
    sources: cleanedSources,
    sourceMap,
    featuredImage: resolveFeaturedImage({
      featuredImage: article.featuredImage,
      content,
      sourceUrls: cleanedSources.map((s) => s.url)
    })
  });
}
var init_generation = __esm({
  "src/pipeline/stages/generation.ts"() {
    "use strict";
    init_models();
    init_v13();
    init_slug();
    init_images();
    init_template();
    init_prompt_budget();
    init_logger();
  }
});

// src/services/seo-research.ts
var seo_research_exports = {};
__export(seo_research_exports, {
  analyzeKeywords: () => analyzeKeywords,
  generateMetaSuggestions: () => generateMetaSuggestions,
  scoreSEO: () => scoreSEO
});
function extractWords(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").split(/\s+/).filter(Boolean);
}
function countOccurrences(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "gi");
  return (text.match(re) ?? []).length;
}
function generateLongTail(topic) {
  const prefixes = ["how to", "best", "top", "why", "what is", "guide to"];
  const suffixes = ["tutorial", "guide", "examples", "best practices", "in 2024", "for beginners"];
  const results = [];
  for (const p of prefixes) results.push(`${p} ${topic}`);
  for (const s of suffixes) results.push(`${topic} ${s}`);
  return results;
}
function analyzeKeywords(topic, _content) {
  const words = extractWords(topic);
  const primary = words.join(" ");
  const longTail = generateLongTail(primary);
  const wordCount2 = words.length;
  const difficulty = Math.min(100, Math.max(10, wordCount2 <= 2 ? 70 : 40));
  const volume = wordCount2 <= 2 ? 5e3 : 1500;
  logger.info("Analyzed keywords", { topic, primary });
  return {
    primaryKeyword: primary,
    longTailKeywords: longTail.slice(0, 8),
    searchVolume: volume,
    difficulty,
    suggestions: longTail.slice(0, 5)
  };
}
function generateMetaSuggestions(article) {
  const { title, content, tags = [] } = article;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const firstSentence = content.split(/[.!?]\s/)[0] ?? "";
  const tagStr = tags.length > 0 ? ` \u2014 ${tags.slice(0, 3).join(", ")}` : "";
  return {
    titles: [
      title,
      `${title}: A Complete Guide`,
      `Everything You Need to Know About ${title}`
    ],
    descriptions: [
      firstSentence.slice(0, 160),
      `Learn about ${title.toLowerCase()}${tagStr}. ${firstSentence}`.slice(0, 160),
      `Discover ${title.toLowerCase()} \u2014 tips, examples, and best practices.`.slice(0, 160)
    ],
    slugSuggestions: [
      slug,
      slug.split("-").slice(0, 5).join("-"),
      `guide-${slug.split("-").slice(0, 4).join("-")}`
    ]
  };
}
function scoreSEO(article) {
  const { title, content, seoTitle, seoDescription, keywords = [], slug } = article;
  const issues = [];
  let score = 100;
  const cfg = appConfig.seo;
  const effectiveTitle = seoTitle ?? title;
  const primaryKeyword = keywords[0]?.toLowerCase() ?? "";
  const wordCount2 = extractWords(content).length;
  if (effectiveTitle.length < cfg.minTitleLength) {
    issues.push({ type: "title-length", message: `Title too short (${effectiveTitle.length} chars, min ${cfg.minTitleLength})`, severity: "warning" });
    score -= 10;
  } else if (effectiveTitle.length > cfg.maxTitleLength) {
    issues.push({ type: "title-length", message: `Title too long (${effectiveTitle.length} chars, max ${cfg.maxTitleLength})`, severity: "warning" });
    score -= 5;
  }
  if (seoDescription) {
    if (seoDescription.length < cfg.minDescLength) {
      issues.push({ type: "desc-length", message: `Meta description too short (${seoDescription.length} chars, min ${cfg.minDescLength})`, severity: "warning" });
      score -= 10;
    } else if (seoDescription.length > cfg.maxDescLength) {
      issues.push({ type: "desc-length", message: `Meta description too long (${seoDescription.length} chars, max ${cfg.maxDescLength})`, severity: "warning" });
      score -= 5;
    }
  } else {
    issues.push({ type: "desc-missing", message: "No meta description provided", severity: "error" });
    score -= 15;
  }
  if (primaryKeyword && !effectiveTitle.toLowerCase().includes(primaryKeyword)) {
    issues.push({ type: "keyword-title", message: "Primary keyword not found in title", severity: "error" });
    score -= 15;
  }
  if (primaryKeyword) {
    const firstParagraph = content.split(/\n\n/)[0] ?? "";
    if (!firstParagraph.toLowerCase().includes(primaryKeyword)) {
      issues.push({ type: "keyword-intro", message: "Primary keyword not in first paragraph", severity: "warning" });
      score -= 10;
    }
  }
  if (primaryKeyword && wordCount2 > 0) {
    const count = countOccurrences(content, primaryKeyword);
    const density = count / wordCount2;
    const target = cfg.targetKeywordDensity;
    if (density < target * 0.5) {
      issues.push({ type: "keyword-density", message: `Keyword density too low (${(density * 100).toFixed(1)}%, target ~${(target * 100).toFixed(0)}%)`, severity: "warning" });
      score -= 10;
    } else if (density > target * 2) {
      issues.push({ type: "keyword-density", message: `Keyword density too high (${(density * 100).toFixed(1)}%) \u2014 may appear spammy`, severity: "warning" });
      score -= 10;
    }
  }
  const headings = content.match(/^#{1,6}\s/gm) ?? [];
  if (headings.length === 0) {
    issues.push({ type: "headings", message: "No headings found \u2014 add H2/H3 for structure", severity: "warning" });
    score -= 10;
  }
  if (slug) {
    if (/[A-Z]/.test(slug)) {
      issues.push({ type: "slug", message: "Slug contains uppercase characters", severity: "info" });
      score -= 2;
    }
    if (slug.length > 75) {
      issues.push({ type: "slug", message: "Slug is very long \u2014 consider shortening", severity: "info" });
      score -= 2;
    }
  }
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  if (sentences.length > 0) {
    const avgWords = sentences.reduce((sum, s) => sum + extractWords(s).length, 0) / sentences.length;
    if (avgWords > 25) {
      issues.push({ type: "readability", message: `Average sentence length is high (${avgWords.toFixed(0)} words) \u2014 aim for under 20`, severity: "info" });
      score -= 5;
    }
  }
  const linkCount = (content.match(/\[.*?\]\(.*?\)/g) ?? []).length;
  if (linkCount === 0 && wordCount2 > 300) {
    issues.push({ type: "internal-links", message: "No links found \u2014 consider adding internal links", severity: "info" });
    score -= 5;
  }
  return { score: Math.max(0, Math.min(100, score)), issues };
}
var init_seo_research = __esm({
  "src/services/seo-research.ts"() {
    "use strict";
    init_config();
    init_logger();
  }
});

// src/pipeline/stages/quality.ts
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function hasIntroduction(content) {
  const first = content.split(/\n{2,}/)[0] ?? "";
  return first.replace(/^#.*$/m, "").trim().length > 40;
}
function hasConclusion(content) {
  return /##?\s*(conclusion|wrap[-\s]?up|final thoughts|takeaways)/i.test(content);
}
function headingCount(content) {
  return (content.match(/^#{1,3}\s+/gm) ?? []).length;
}
function h2Count(content) {
  return (content.match(/^##\s+/gm) ?? []).length;
}
function hasIntroBeforeFirstH2(content) {
  const idx = content.search(/^##\s+/m);
  if (idx === -1) return true;
  const before = content.slice(0, idx).replace(/^#\s+.*$/m, "").trim();
  return before.length > 40;
}
function paragraphRepetitionScore(content) {
  const paragraphs = content.split(/\n{2,}/).map((p) => p.trim().toLowerCase()).filter((p) => p.length > 40);
  if (paragraphs.length < 2) return 0;
  let dups = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const p of paragraphs) {
    const key = p.slice(0, 120);
    if (seen.has(key)) dups += 1;
    seen.add(key);
  }
  return dups / paragraphs.length;
}
function extractSentences(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "").replace(/^#+\s+.*$/gm, "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 30 && s.length < 300);
}
function checkPlagiarism(article, sources) {
  const sentences = extractSentences(article);
  if (sentences.length === 0) return { ratio: 0, matched: [] };
  const sample = sentences.sort(() => Math.random() - 0.5).slice(0, Math.min(5, Math.max(3, sentences.length)));
  const sourceCorpus = sources.map((s) => s.content.toLowerCase()).join("\n");
  const matched = [];
  for (const sent of sample) {
    const normalized = sent.toLowerCase().replace(/\s+/g, " ");
    if (sourceCorpus.includes(normalized)) {
      matched.push(sent.slice(0, 80));
    }
  }
  return { ratio: matched.length / sample.length, matched };
}
function averageSentenceLength(text) {
  const sentences = extractSentences(text);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + wordCount(s), 0);
  return totalWords / sentences.length;
}
function averageParagraphSentenceCount(text) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 20 && !p.startsWith("#") && !p.startsWith("```"));
  if (paragraphs.length === 0) return 0;
  const counts = paragraphs.map(
    (p) => (p.match(/[.!?]+/g) ?? []).length || 1
  );
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}
function detectPassiveVoice(text) {
  const pattern = /\b(?:was|were|been|being)\s+\w+(?:ed|en)\b/gi;
  return (text.match(pattern) ?? []).length;
}
function hasCodeBlocks(content) {
  return /```[\s\S]*?```/.test(content);
}
function isTechnicalTopic(article) {
  const techKeywords = /\b(?:api|code|programming|software|developer|typescript|javascript|python|react|node|database|sql|docker|kubernetes|git|cli|framework|library|sdk|http|rest|graphql)\b/i;
  return techKeywords.test(article.title) || techKeywords.test(article.content.slice(0, 500)) || (article.tags ?? []).some((t) => techKeywords.test(t));
}
function checkFactualConsistency(article, analysis) {
  if (!analysis?.claims?.length) return [];
  const unsupported = [];
  const claimTexts = analysis.claims.map((c) => c.claim.toLowerCase());
  const articleSentences = extractSentences(article);
  const claimPatterns = claimTexts.map((c) => {
    const keywords = c.split(/\s+/).filter((w) => w.length > 4).slice(0, 5);
    return keywords;
  });
  const statPattern = /\b\d[\d,.]*\s*(?:%|percent|million|billion|thousand)\b/gi;
  const articleClaims = articleSentences.filter((s) => statPattern.test(s));
  for (const claim of articleClaims) {
    const claimLower = claim.toLowerCase();
    const hasSupport = claimPatterns.some((keywords) => {
      if (keywords.length === 0) return true;
      const matchCount = keywords.filter((kw) => claimLower.includes(kw)).length;
      return matchCount >= Math.ceil(keywords.length * 0.5);
    });
    if (!hasSupport) {
      unsupported.push(claim.slice(0, 100));
    }
  }
  return unsupported;
}
function qualityStage(article, sources, analysis) {
  const issues = [];
  let score = 100;
  const add = (severity, type, message, penalty) => {
    issues.push({ severity, type, message });
    score -= penalty;
  };
  if (!article.title?.trim()) add("error", "missing_title", "Title is missing.", 25);
  if (!article.content?.trim()) add("error", "empty_content", "Article content is empty.", 40);
  const words = wordCount(article.content);
  if (words < 250) add("warning", "short_content", `Article is short (${words} words).`, 10);
  if (words > 4e3) add("info", "long_content", `Article is long (${words} words).`, 2);
  if (!hasIntroduction(article.content)) {
    add("warning", "missing_introduction", "Introduction looks weak or missing.", 8);
  }
  if (!hasConclusion(article.content)) {
    add("warning", "missing_conclusion", "No clear conclusion heading found.", 6);
  }
  const headings = headingCount(article.content);
  if (headings === 0) add("warning", "missing_headings", "No Markdown headings found.", 8);
  if (headings > 20) add("warning", "excessive_headings", "Too many headings.", 5);
  const rep = paragraphRepetitionScore(article.content);
  if (rep > 0.2) {
    add("warning", "repetitive_content", "Paragraphs look excessively repetitive.", 12);
  }
  const lower = article.content.toLowerCase();
  for (const phrase of FILLER_PHRASES) {
    if (lower.includes(phrase)) {
      add("warning", "obvious_filler", `Filler phrase detected: "${phrase}"`, 5);
    }
  }
  const plagiarism = checkPlagiarism(article.content, sources);
  if (plagiarism.ratio > 0.4) {
    add(
      "warning",
      "plagiarism_detected",
      `${Math.round(plagiarism.ratio * 100)}% of sampled sentences appear verbatim in sources: ${plagiarism.matched.join("; ")}`,
      15
    );
  }
  if (!hasIntroBeforeFirstH2(article.content)) {
    add("warning", "no_intro_before_h2", "No intro paragraph before first H2 heading.", 5);
  }
  const h2s = h2Count(article.content);
  if (h2s < 3) add("warning", "too_few_h2", `Only ${h2s} H2 headings (3-8 ideal).`, 5);
  if (h2s > 8) add("info", "many_h2", `${h2s} H2 headings (3-8 ideal).`, 2);
  if (isTechnicalTopic(article) && !hasCodeBlocks(article.content)) {
    add("info", "missing_code_blocks", "Technical topic but no code blocks found.", 3);
  }
  const sourcesCitedInContent = article.sources.some(
    (s) => article.content.includes(s.url) || article.content.toLowerCase().includes(s.title.toLowerCase())
  );
  if (article.sources.length > 0 && !sourcesCitedInContent) {
    add("info", "sources_not_cited_inline", "Sources are listed but not referenced in body text.", 3);
  }
  const avgSentLen = averageSentenceLength(article.content);
  if (avgSentLen > 25) {
    add("warning", "long_sentences", `Average sentence length is ${Math.round(avgSentLen)} words (aim for \u226425).`, 5);
  }
  const avgParaLen = averageParagraphSentenceCount(article.content);
  if (avgParaLen > 5) {
    add("warning", "long_paragraphs", `Average paragraph has ${avgParaLen.toFixed(1)} sentences (aim for \u22645).`, 4);
  }
  const passiveCount = detectPassiveVoice(article.content);
  const passiveRatio = words > 0 ? passiveCount / (words / 20) : 0;
  if (passiveRatio > 0.3) {
    add("info", "passive_voice", `High passive voice usage (${passiveCount} instances detected).`, 3);
  }
  const unsupported = checkFactualConsistency(article.content, analysis);
  if (unsupported.length > 0) {
    for (const claim of unsupported.slice(0, 3)) {
      add("warning", "unsupported_claim", `Claim not found in research: "${claim}"`, 5);
    }
  }
  const researchUrls = new Set(sources.map((s) => s.url));
  const citedUrls = /* @__PURE__ */ new Set();
  for (const s of article.sources) {
    if (!isValidHttpUrl(s.url)) {
      add("error", "invalid_source_url", `Invalid source URL: ${s.url}`, 15);
      continue;
    }
    if (citedUrls.has(s.url)) {
      add("warning", "duplicate_source", `Duplicate source URL: ${s.url}`, 4);
    }
    citedUrls.add(s.url);
    if (!researchUrls.has(s.url) && !s.url.includes("example.com")) {
      add(
        "warning",
        "unverified_source",
        `Cited URL was not in research set: ${s.url}`,
        6
      );
    }
  }
  const knownIds = new Set(sources.map((s) => s.id));
  for (const mapping of article.sourceMap ?? []) {
    for (const id of mapping.sourceIds) {
      if (!knownIds.has(id)) {
        add("error", "fabricated_citation", `sourceMap references unknown source id ${id}`, 20);
      }
    }
  }
  const statMatches = article.content.match(/\b\d{1,3}(?:\.\d+)?%/g) ?? [];
  if (statMatches.length > 0 && article.sources.length === 0) {
    add(
      "warning",
      "missing_source",
      "Percentage statistics present but no sources listed.",
      10
    );
  }
  if (!article.slug?.trim()) add("error", "missing_slug", "Slug is missing.", 10);
  if (article.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) {
    add("warning", "invalid_slug", "Slug should be lowercase kebab-case.", 5);
  }
  if (!article.seoTitle?.trim()) add("warning", "missing_seo_title", "SEO title missing.", 5);
  if (article.seoTitle && article.seoTitle.length > 70) {
    add("info", "seo_title_long", "SEO title is longer than 70 characters.", 2);
  }
  if (!article.seoDescription?.trim()) {
    add("warning", "missing_seo_description", "SEO description missing.", 5);
  }
  if (article.seoDescription && article.seoDescription.length > 160) {
    add("info", "seo_description_long", "SEO description is longer than 160 characters.", 2);
  }
  if ((article.keywords ?? []).length === 0) {
    add("info", "missing_keywords", "No keywords set.", 2);
  }
  for (const kw of article.keywords ?? []) {
    if (!kw.trim()) continue;
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const count = (article.content.match(re) ?? []).length;
    if (count > 25) {
      add("warning", "keyword_stuffing", `Keyword "${kw}" appears ${count} times.`, 8);
    }
  }
  let seoWeight = 0;
  let seoScore = 100;
  if (scoreSEO2) {
    try {
      const result = scoreSEO2(article);
      seoScore = result.score;
      seoWeight = 0.3;
      for (const issue of result.issues) {
        add("warning", "seo_issue", issue, 0);
      }
    } catch {
    }
  }
  score = Math.max(0, Math.min(100, score));
  if (seoWeight > 0) {
    score = Math.round(score * (1 - seoWeight) + seoScore * seoWeight);
  }
  score = Math.max(0, Math.min(100, score));
  const hasError = issues.some((i) => i.severity === "error");
  return {
    passed: !hasError && score >= 60,
    score,
    issues
  };
}
var scoreSEO2, FILLER_PHRASES;
var init_quality = __esm({
  "src/pipeline/stages/quality.ts"() {
    "use strict";
    init_url();
    try {
      const mod = (init_seo_research(), __toCommonJS(seo_research_exports));
      if (typeof mod?.scoreSEO === "function") scoreSEO2 = mod.scoreSEO;
    } catch {
    }
    FILLER_PHRASES = [
      "in today's fast-paced world",
      "it goes without saying",
      "in conclusion, it is important to note",
      "leverage synergies",
      "revolutionize the way",
      "unlock the power of",
      "in this comprehensive guide"
    ];
  }
});

// src/pipeline/stages/publishing.ts
import sanitizeHtml from "sanitize-html";
function sanitizeContent(content) {
  return sanitizeHtml(content, {
    allowedTags: [],
    allowedAttributes: {}
  });
}
function toPublishableBlog(article) {
  return {
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: sanitizeContent(article.content),
    tags: article.tags,
    keywords: article.keywords,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    featuredImage: resolveFeaturedImage({
      featuredImage: article.featuredImage,
      content: article.content,
      sourceUrls: article.sources.map((s) => s.url)
    }),
    publishedAt: null,
    sources: article.sources.map((s) => ({
      title: s.title,
      url: s.url,
      sourceName: s.sourceName
    }))
  };
}
function isLivePublishTarget(target) {
  const envMap = {
    spanwrap: ["SPANWRAP_API_KEY"],
    medium: ["MEDIUM_TOKEN"],
    devto: ["DEVTO_API_KEY"],
    hashnode: ["HASHNODE_TOKEN", "HASHNODE_PUBLICATION_ID"],
    wordpress: ["WORDPRESS_URL", "WORDPRESS_USER", "WORDPRESS_APP_PASSWORD"],
    substack: []
  };
  const vars = envMap[target];
  if (!vars || vars.length === 0) return true;
  return vars.every((v) => process.env[v]);
}
async function publishingStage(article, spanwrapPublisher, idempotencyKey, targets = ["spanwrap"]) {
  const blog = toPublishableBlog(article);
  const selected = targets.length ? targets : ["spanwrap"];
  const results = [];
  for (const target of selected) {
    if (target === "spanwrap") {
      const result = await spanwrapPublisher.publish(blog, {
        idempotencyKey: `${idempotencyKey}:${target}`
      });
      results.push({ ...result, target });
    } else if (isLivePublishTarget(target)) {
      const pub = createPublisherForTarget(target);
      const result = await pub.publish(blog, {
        idempotencyKey: `${idempotencyKey}:${target}`
      });
      results.push({ ...result, target });
    } else {
      results.push({
        target,
        success: false,
        statusCode: 501,
        message: `${SITE_LABEL[target]} credentials not configured.`,
        idempotencyKey: `${idempotencyKey}:${target}`
      });
    }
  }
  const live = results.filter((r) => r.target === "spanwrap" || isLivePublishTarget(r.target));
  const primary = live[0] ?? results[0];
  return { primary, results };
}
var SITE_LABEL;
var init_publishing2 = __esm({
  "src/pipeline/stages/publishing.ts"() {
    "use strict";
    init_publishing();
    init_images();
    SITE_LABEL = {
      spanwrap: "Spanwrap",
      medium: "Medium",
      devto: "Dev.to",
      hashnode: "Hashnode",
      wordpress: "WordPress",
      substack: "Substack"
    };
  }
});

// src/providers/images/mock.ts
var MockImageProvider;
var init_mock4 = __esm({
  "src/providers/images/mock.ts"() {
    "use strict";
    MockImageProvider = class {
      name = "mock";
      async generateImage(prompt) {
        return {
          url: null,
          base64: null,
          mimeType: "image/png",
          prompt,
          type: "hero",
          altText: `Mock image: ${prompt.slice(0, 80)}`
        };
      }
      async generateBlogImages(article) {
        return [
          {
            url: null,
            base64: null,
            mimeType: "image/png",
            prompt: `Hero for: ${article.title}`,
            type: "hero",
            altText: `Hero image for ${article.title}`
          }
        ];
      }
    };
  }
});

// src/providers/images/gemini.ts
var GeminiImageProvider;
var init_gemini = __esm({
  "src/providers/images/gemini.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_retry();
    GeminiImageProvider = class {
      constructor(apiKey = appConfig.images?.geminiApiKey ?? appConfig.llm.apiKey) {
        this.apiKey = apiKey;
      }
      apiKey;
      name = "gemini";
      async generateImage(prompt, options = {}) {
        if (!this.apiKey) {
          logger.warn("No Gemini API key for image generation; returning placeholder");
          return {
            url: null,
            base64: null,
            mimeType: "image/png",
            prompt,
            type: "hero",
            altText: prompt.slice(0, 120)
          };
        }
        return withRetry(
          async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 6e4);
            try {
              const body = {
                contents: [
                  {
                    parts: [
                      {
                        text: `Generate a professional blog illustration: ${prompt}${options.style ? `. Style: ${options.style}` : ""}. Make it clean, modern, and suitable for a tech blog.`
                      }
                    ]
                  }
                ],
                generationConfig: {
                  responseModalities: ["IMAGE", "TEXT"],
                  imageSizeOptions: {
                    aspectRatio: options.aspectRatio || "16:9"
                  }
                }
              };
              const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${this.apiKey}`,
                {
                  method: "POST",
                  signal: controller.signal,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body)
                }
              );
              if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini image API error ${response.status}: ${errText.slice(0, 300)}`);
              }
              const data = await response.json();
              const parts = data.candidates?.[0]?.content?.parts ?? [];
              const imagePart = parts.find((p) => p.inlineData);
              if (!imagePart?.inlineData) {
                logger.warn("Gemini did not return an image", { prompt: prompt.slice(0, 80) });
                return {
                  url: null,
                  base64: null,
                  mimeType: "image/png",
                  prompt,
                  type: "hero",
                  altText: prompt.slice(0, 120)
                };
              }
              return {
                url: null,
                base64: imagePart.inlineData.data,
                mimeType: imagePart.inlineData.mimeType,
                prompt,
                type: "hero",
                altText: prompt.slice(0, 120)
              };
            } finally {
              clearTimeout(timer);
            }
          },
          { maxAttempts: 2, baseDelayMs: 2e3 }
        );
      }
      async generateBlogImages(article) {
        const images = [];
        const heroPrompt = `A visually striking hero image for a tech blog post titled "${article.title}". ${article.excerpt}. Tags: ${article.tags.join(", ")}`;
        const hero = await this.generateImage(heroPrompt, { aspectRatio: "16:9" });
        hero.type = "hero";
        images.push(hero);
        const h2s = article.content.match(/^## .+$/gm) ?? [];
        const sectionHeadings = h2s.slice(0, 3);
        for (const heading of sectionHeadings) {
          const clean = heading.replace(/^## /, "");
          const sectionPrompt = `A clean, minimal illustration for a blog section about "${clean}" in the context of "${article.title}". Use flat design, tech-inspired visuals.`;
          const img = await this.generateImage(sectionPrompt, { aspectRatio: "16:9" });
          img.type = "section";
          img.altText = `Illustration for: ${clean}`;
          images.push(img);
        }
        const socialPrompt = `A social media card image for a blog post: "${article.title}". Bold, eye-catching, minimal text area for overlays.`;
        const social = await this.generateImage(socialPrompt, { aspectRatio: "1:1" });
        social.type = "social";
        images.push(social);
        return images;
      }
    };
  }
});

// src/providers/images/index.ts
function createImageProvider(override) {
  if (override === "mock") return new MockImageProvider();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey) return new MockImageProvider();
  return new GeminiImageProvider(geminiKey);
}
var init_images2 = __esm({
  "src/providers/images/index.ts"() {
    "use strict";
    init_mock4();
    init_gemini();
    init_gemini();
    init_mock4();
  }
});

// src/pipeline/stages/images.ts
import { mkdir as mkdir3, writeFile as writeFile3 } from "node:fs/promises";
import path5 from "node:path";
async function saveBase64Image(base64, mimeType, filename, outputDir) {
  await mkdir3(outputDir, { recursive: true });
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const filePath2 = path5.join(outputDir, `${filename}.${ext}`);
  await writeFile3(filePath2, Buffer.from(base64, "base64"));
  return filePath2;
}
async function imageStage(article, runId) {
  const provider = createImageProvider();
  const outputDir = path5.join(appConfig.images.outputDir, runId);
  logger.info("Generating blog images", { provider: provider.name, runId });
  const allImages = await provider.generateBlogImages({
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    tags: article.tags
  });
  const savedPaths = [];
  for (let i = 0; i < allImages.length; i++) {
    const img = allImages[i];
    if (img.base64) {
      const saved = await saveBase64Image(
        img.base64,
        img.mimeType,
        `${img.type}-${i}`,
        outputDir
      );
      savedPaths.push(saved);
    }
  }
  const heroImage = allImages.find((i) => i.type === "hero") ?? null;
  const sectionImages = allImages.filter((i) => i.type === "section");
  const socialImage = allImages.find((i) => i.type === "social") ?? null;
  logger.info("Image generation complete", {
    total: allImages.length,
    saved: savedPaths.length
  });
  return { heroImage, sectionImages, socialImage, savedPaths };
}
function publicImageUrl(runId, filename) {
  return `/api/runs/${encodeURIComponent(runId)}/images/${encodeURIComponent(filename)}`;
}
function applyGeneratedImages(article, result, runId) {
  const filenames = result.savedPaths.map((saved) => path5.basename(saved));
  const heroFile = filenames.find((name) => name.startsWith("hero-"));
  const sectionFiles = filenames.filter((name) => name.startsWith("section-"));
  let content = article.content;
  const headings = content.match(/^## .+$/gm) ?? [];
  for (let i = 0; i < Math.min(sectionFiles.length, headings.length); i++) {
    const heading = headings[i];
    const file = sectionFiles[i];
    const alt = result.sectionImages[i]?.altText || heading.replace(/^##\s+/, "");
    const imageMd = `![${alt}](${publicImageUrl(runId, file)})`;
    if (content.includes(imageMd)) continue;
    const idx = content.indexOf(heading);
    if (idx < 0) continue;
    const end = content.indexOf("\n", idx);
    const insertAt = end === -1 ? content.length : end + 1;
    content = `${content.slice(0, insertAt)}
${imageMd}
${content.slice(insertAt)}`;
  }
  const featuredImage = article.featuredImage || (heroFile ? publicImageUrl(runId, heroFile) : null);
  return { ...article, content, featuredImage };
}
var init_images3 = __esm({
  "src/pipeline/stages/images.ts"() {
    "use strict";
    init_images2();
    init_logger();
    init_config();
  }
});

// src/pipeline/stages/index.ts
var init_stages = __esm({
  "src/pipeline/stages/index.ts"() {
    "use strict";
    init_research2();
    init_analysis();
    init_outline();
    init_generation();
    init_quality();
    init_publishing2();
    init_images3();
  }
});

// src/pipeline/state.ts
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function startStage(run, stage, extra) {
  const record = {
    stage,
    status: "running",
    startedAt: nowIso(),
    endedAt: null,
    durationMs: null,
    retryCount: 0,
    error: null,
    meta: {},
    ...extra
  };
  const stages = [...run.stages.filter((s) => s.stage !== stage), record];
  return { ...run, stages, updatedAt: nowIso() };
}
function completeStage(run, stage, meta = {}) {
  const stages = run.stages.map((s) => {
    if (s.stage !== stage) return s;
    const endedAt = nowIso();
    const start = s.startedAt ? Date.parse(s.startedAt) : Date.now();
    return {
      ...s,
      status: "completed",
      endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - start),
      meta: { ...s.meta, ...meta },
      error: null
    };
  });
  return { ...run, stages, updatedAt: nowIso() };
}
function failStage(run, stage, error, opts) {
  const stages = run.stages.map((s) => {
    if (s.stage !== stage) return s;
    const endedAt = nowIso();
    const start = s.startedAt ? Date.parse(s.startedAt) : Date.now();
    return {
      ...s,
      status: "failed",
      endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - start),
      error
    };
  });
  return {
    ...run,
    stages,
    status: "FAILED",
    error,
    failedStage: stage,
    errorCode: opts?.errorCode ?? classifyErrorCode(error),
    retryable: opts?.retryable ?? isRetryableError(error),
    updatedAt: nowIso()
  };
}
function classifyErrorCode(message) {
  const m = message.toLowerCase();
  if (m.includes("timed out") || m.includes("timeout")) return "LLM_TIMEOUT";
  if (m.includes("rate limit") || m.includes("429") || m.includes("tpm")) return "RATE_LIMIT";
  if (m.includes("prompt too large") || m.includes("413")) return "PROMPT_TOO_LARGE";
  if (m.includes("no usable sources")) return "RESEARCH_EMPTY";
  if (m.includes("model") && (m.includes("not found") || m.includes("unavailable"))) return "MODEL_NOT_FOUND";
  if (m.includes("api key")) return "AUTH_ERROR";
  if (m.includes("empty llm response")) return "EMPTY_RESPONSE";
  if (/5\d\d/.test(message)) return "SERVER_ERROR";
  return "UNKNOWN";
}
function isRetryableError(message) {
  const code = classifyErrorCode(message);
  return ["LLM_TIMEOUT", "RATE_LIMIT", "SERVER_ERROR", "EMPTY_RESPONSE"].includes(code);
}
function setStatus(run, status) {
  const isFailed = status === "FAILED";
  return {
    ...run,
    status,
    updatedAt: nowIso(),
    error: isFailed ? run.error : null,
    failedStage: isFailed ? run.failedStage : null,
    errorCode: isFailed ? run.errorCode : null,
    retryable: isFailed ? run.retryable : false
  };
}
var init_state = __esm({
  "src/pipeline/state.ts"() {
    "use strict";
  }
});

// src/services/affiliate-links.ts
import fs from "node:fs";
import path6 from "node:path";
import { z as z3 } from "zod";
function loadAffiliateConfig() {
  const absPath = path6.join(process.cwd(), ".data", "affiliate-links.json");
  if (fs.existsSync(absPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(absPath, "utf-8"));
      const parsed = AffiliateConfigSchema.parse(raw);
      logger.info("Loaded affiliate config from file", { path: absPath, count: parsed.links.length });
      return parsed;
    } catch (err) {
      logger.warn("Failed to parse affiliate config file, trying env fallback", {
        error: String(err)
      });
    }
  }
  const envJson = process.env.AFFILIATE_LINKS_JSON;
  if (envJson) {
    try {
      const parsed = AffiliateConfigSchema.parse(JSON.parse(envJson));
      logger.info("Loaded affiliate config from env", { count: parsed.links.length });
      return parsed;
    } catch (err) {
      logger.warn("Failed to parse AFFILIATE_LINKS_JSON env", { error: String(err) });
    }
  }
  return { links: DEFAULT_LINKS };
}
function injectAffiliateLinks(content, config) {
  const cfg = config ?? loadAffiliateConfig();
  const maxPerTool = cfg.maxLinksPerTool ?? 1;
  const maxTotal = cfg.maxTotalLinks ?? 10;
  const injected = [];
  let result = content;
  let totalInjected = 0;
  for (const mapping of cfg.links) {
    if (totalInjected >= maxTotal) break;
    const names = [mapping.name, ...mapping.aliases ?? []];
    let toolCount = 0;
    for (const name of names) {
      if (toolCount >= maxPerTool || totalInjected >= maxTotal) break;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<!\\[)(?<!\\()\\b(${escaped})\\b(?!\\])(?!\\))`, "g");
      let replaced = false;
      result = result.replace(re, (_match, toolName) => {
        if (toolCount >= maxPerTool || totalInjected >= maxTotal) return toolName;
        toolCount++;
        totalInjected++;
        replaced = true;
        return `[${toolName}](${mapping.url})`;
      });
      if (replaced) {
        injected.push({ tool: mapping.name, url: mapping.url, count: toolCount });
      }
    }
  }
  logger.info("Affiliate links injected", { total: totalInjected });
  return { content: result, linksInjected: injected };
}
var AffiliateMappingSchema, AffiliateConfigSchema, DEFAULT_LINKS;
var init_affiliate_links = __esm({
  "src/services/affiliate-links.ts"() {
    "use strict";
    init_logger();
    AffiliateMappingSchema = z3.object({
      name: z3.string(),
      url: z3.string().url(),
      aliases: z3.array(z3.string()).optional()
    });
    AffiliateConfigSchema = z3.object({
      links: z3.array(AffiliateMappingSchema),
      maxLinksPerTool: z3.number().int().positive().optional(),
      maxTotalLinks: z3.number().int().positive().optional()
    });
    DEFAULT_LINKS = [
      { name: "AWS", url: "https://aws.amazon.com", aliases: ["Amazon Web Services"] },
      { name: "Vercel", url: "https://vercel.com" },
      { name: "Netlify", url: "https://netlify.com" },
      { name: "GitHub", url: "https://github.com" },
      { name: "DigitalOcean", url: "https://digitalocean.com", aliases: ["Digital Ocean"] },
      { name: "Cloudflare", url: "https://cloudflare.com" },
      { name: "Supabase", url: "https://supabase.com" },
      { name: "PlanetScale", url: "https://planetscale.com" },
      { name: "Railway", url: "https://railway.app" },
      { name: "Render", url: "https://render.com" }
    ];
  }
});

// src/services/analytics.ts
import fs2 from "node:fs";
import path7 from "node:path";
function analyticsDir() {
  const dir = appConfig.analytics.dataDir;
  return path7.isAbsolute(dir) ? dir : path7.join(process.cwd(), dir);
}
function filePath(runId) {
  return path7.join(analyticsDir(), `${runId}.json`);
}
function ensureDir() {
  const dir = analyticsDir();
  if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
}
function writeRecord(record) {
  ensureDir();
  fs2.writeFileSync(filePath(record.runId), JSON.stringify(record, null, 2));
}
function recordPublish(runId, platform, externalId) {
  const record = {
    runId,
    publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    views: 0,
    reads: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    estimatedRevenue: 0,
    topReferrers: [],
    platform,
    externalId,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeRecord(record);
  logger.info("Recorded publish", { runId, platform });
  return record;
}
var init_analytics = __esm({
  "src/services/analytics.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_retry();
  }
});

// src/services/social-promotion.ts
function articleUrl(slug) {
  const base = appConfig.social.blogBaseUrl.replace(/\/$/, "");
  return `${base}/${slug}`;
}
function generatePromotionContent(article) {
  const url = articleUrl(article.slug);
  const tags = (article.tags ?? []).slice(0, 3).map((t) => `#${t.replace(/\s+/g, "")}`);
  const excerpt = article.excerpt ?? "";
  const tagStr = tags.join(" ");
  let tweet = `${article.title}

${url}`;
  if ((tweet + "\n\n" + tagStr).length <= 280) {
    tweet = `${article.title}

${url}

${tagStr}`;
  }
  if (tweet.length > 280) tweet = tweet.slice(0, 277) + "...";
  const linkedInPost = [
    article.title,
    "",
    excerpt.slice(0, 300) || "Check out my latest article:",
    "",
    url,
    "",
    tags.join(" ")
  ].join("\n").trim();
  const redditTitle = article.title;
  const redditBody = [
    excerpt || `I wrote about ${article.title.toLowerCase()}.`,
    "",
    `Full article: ${url}`
  ].join("\n");
  return { tweet, linkedInPost, redditTitle, redditBody };
}
async function postJson(url, body, headers) {
  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`), {
          status: res.status
        });
      }
      return res;
    },
    { maxAttempts: 2 }
  );
}
async function promoteTweet(article) {
  const { xApiKey, xApiSecret, xAccessToken, xAccessSecret } = appConfig.social;
  if (!xApiKey || !xApiSecret || !xAccessToken || !xAccessSecret) {
    return { platform: "twitter", success: false, message: "Missing X/Twitter API credentials" };
  }
  const { tweet } = generatePromotionContent(article);
  try {
    await postJson("https://api.twitter.com/2/tweets", { text: tweet }, {
      Authorization: `Bearer ${xAccessToken}`
    });
    logger.info("Posted to Twitter", { slug: article.slug });
    return { platform: "twitter", success: true, message: "Posted successfully" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Twitter promotion failed", { error: msg });
    return { platform: "twitter", success: false, message: msg };
  }
}
async function promoteLinkedIn(article) {
  const { linkedinAccessToken } = appConfig.social;
  if (!linkedinAccessToken) {
    return { platform: "linkedin", success: false, message: "Missing LinkedIn access token" };
  }
  const { linkedInPost } = generatePromotionContent(article);
  try {
    await postJson(
      "https://api.linkedin.com/v2/ugcPosts",
      {
        author: "urn:li:person:me",
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: linkedInPost },
            shareMediaCategory: "NONE"
          }
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
      },
      { Authorization: `Bearer ${linkedinAccessToken}` }
    );
    logger.info("Posted to LinkedIn", { slug: article.slug });
    return { platform: "linkedin", success: true, message: "Posted successfully" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("LinkedIn promotion failed", { error: msg });
    return { platform: "linkedin", success: false, message: msg };
  }
}
async function promoteReddit(article, subreddit) {
  const { redditClientId, redditClientSecret, redditUsername, redditPassword } = appConfig.social;
  if (!redditClientId || !redditClientSecret || !redditUsername || !redditPassword) {
    return { platform: "reddit", success: false, message: "Missing Reddit API credentials" };
  }
  try {
    const authRes = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${redditClientId}:${redditClientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `grant_type=password&username=${encodeURIComponent(redditUsername)}&password=${encodeURIComponent(redditPassword)}`
    });
    if (!authRes.ok) throw new Error(`Reddit auth failed: ${authRes.status}`);
    const authData = await authRes.json();
    const { redditTitle, redditBody } = generatePromotionContent(article);
    await postJson(
      "https://oauth.reddit.com/api/submit",
      {
        sr: subreddit,
        kind: "self",
        title: redditTitle,
        text: redditBody
      },
      { Authorization: `Bearer ${authData.access_token}`, "User-Agent": "SpanwrapBot/1.0" }
    );
    logger.info("Posted to Reddit", { slug: article.slug, subreddit });
    return { platform: "reddit", success: true, message: `Posted to r/${subreddit}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Reddit promotion failed", { error: msg });
    return { platform: "reddit", success: false, message: msg };
  }
}
async function promoteAll(article, subreddit = "programming") {
  const results = await Promise.allSettled([
    promoteTweet(article),
    promoteLinkedIn(article),
    promoteReddit(article, subreddit)
  ]);
  return results.map(
    (r) => r.status === "fulfilled" ? r.value : { platform: "unknown", success: false, message: String(r.reason) }
  );
}
var init_social_promotion = __esm({
  "src/services/social-promotion.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_retry();
  }
});

// src/pipeline/orchestrator.ts
async function withRunLock(id, fn) {
  const previous = runLocks.get(id) ?? Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);
  runLocks.set(id, chained);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (runLocks.get(id) === chained) runLocks.delete(id);
  }
}
function createOrchestrator(deps) {
  return new BlogPipelineOrchestrator(deps);
}
var runLocks, EDITABLE_STATUSES, BlogPipelineOrchestrator;
var init_orchestrator = __esm({
  "src/pipeline/orchestrator.ts"() {
    "use strict";
    init_models();
    init_llm();
    init_publishing();
    init_logger();
    init_storage();
    init_templates();
    init_idempotency();
    init_stages();
    init_state();
    init_affiliate_links();
    init_analytics();
    init_social_promotion();
    init_config();
    runLocks = /* @__PURE__ */ new Map();
    EDITABLE_STATUSES = [
      "CREATED",
      "RESEARCH_COMPLETE",
      "OUTLINE_READY",
      "DRAFT_READY",
      "REVIEW_REQUIRED",
      "APPROVED",
      "PUBLISH_FAILED"
    ];
    BlogPipelineOrchestrator = class {
      store;
      templateStore;
      llm;
      publisher;
      researchProvider;
      offlineExtract;
      constructor(deps = {}) {
        this.store = deps.store ?? getRunStore();
        this.templateStore = deps.templateStore ?? getTemplateStore();
        this.llm = deps.llm ?? createLLMProvider();
        this.publisher = deps.publisher ?? createPublisher();
        this.researchProvider = deps.researchProvider;
        this.offlineExtract = deps.offlineExtract ?? false;
      }
      async create(briefInput, options = {}) {
        const brief = ContentBriefSchema.parse(briefInput);
        const id = createId("run");
        const now = (/* @__PURE__ */ new Date()).toISOString();
        let templateId = options.templateId ?? null;
        let templateName = null;
        let templateMarkdown = null;
        if (templateId) {
          const tpl = await this.templateStore.require(templateId);
          templateName = tpl.name;
          templateMarkdown = tpl.markdown;
        }
        const run = {
          id,
          status: "CREATED",
          createdAt: now,
          updatedAt: now,
          brief,
          templateId,
          templateName,
          templateMarkdown,
          sources: [],
          analysis: null,
          outline: null,
          article: null,
          quality: null,
          generateImages: false,
          publishTargets: ["spanwrap"],
          publishResult: null,
          publishResults: [],
          stages: [],
          reviewNotes: null,
          error: null,
          failedStage: null,
          errorCode: null,
          retryable: false,
          idempotencyKey: createIdempotencyKey([id, brief.topic, "publish"])
        };
        return this.store.save(run);
      }
      async assignTemplate(id, templateId) {
        const run = await this.store.require(id);
        if (["PUBLISHED", "CANCELLED"].includes(run.status)) {
          throw new Error(`Cannot change template in status ${run.status}`);
        }
        if (!templateId) {
          return this.store.save({
            ...run,
            templateId: null,
            templateName: null,
            templateMarkdown: null,
            outline: null,
            article: null,
            quality: null
          });
        }
        const tpl = await this.templateStore.require(templateId);
        return this.store.save({
          ...run,
          templateId: tpl.id,
          templateName: tpl.name,
          templateMarkdown: tpl.markdown,
          outline: null,
          article: null,
          quality: null
        });
      }
      async get(id) {
        return this.store.require(id);
      }
      async list() {
        return this.store.list();
      }
      async research(id) {
        return withRunLock(id, () => this.researchUnlocked(id));
      }
      async researchUnlocked(id) {
        let run = await this.store.require(id);
        run = await this.store.save(setStatus(startStage(run, "research"), "RESEARCHING"));
        let latest = run;
        try {
          const { sources, providerName } = await researchStage(run.brief, {
            researchProvider: this.researchProvider,
            offlineExtract: this.offlineExtract
          });
          let next = {
            ...run,
            sources,
            analysis: null,
            outline: null,
            article: null,
            quality: null
          };
          next = completeStage(next, "research", {
            sourcesFound: sources.length,
            provider: providerName
          });
          next = setStatus(next, "RESEARCH_COMPLETE");
          next = startStage(next, "analysis", {
            provider: this.llm.name,
            model: this.llm.model
          });
          next = await this.store.save(next);
          latest = next;
          const analysis = await analysisStage(next.brief, next.sources, this.llm);
          next = {
            ...next,
            analysis
          };
          next = completeStage(next, "analysis", {
            claims: analysis.claims.length,
            provider: this.llm.name,
            model: this.llm.model
          });
          return this.store.save(next);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error("Research stage failed", { id, error: message });
          const stageName = latest.stages.some((s) => s.stage === "analysis" && s.status === "running") ? "analysis" : "research";
          return this.store.save(failStage(latest, stageName, message));
        }
      }
      async outline(id) {
        return withRunLock(id, () => this.outlineUnlocked(id));
      }
      async outlineUnlocked(id) {
        let run = await this.store.require(id);
        if (run.sources.length === 0 || !run.analysis) {
          return this.store.save(
            failStage(
              startStage(run, "outline"),
              "outline",
              "Research + analysis must complete before outline"
            )
          );
        }
        const analysis = run.analysis;
        run = startStage(run, "outline", { provider: this.llm.name, model: this.llm.model });
        run = await this.store.save(run);
        try {
          const outline = await outlineStage(
            run.brief,
            run.sources,
            analysis,
            this.llm,
            run.templateMarkdown
          );
          let next = {
            ...run,
            outline,
            article: null,
            quality: null
          };
          next = completeStage(next, "outline", {
            sections: outline.sections.length,
            provider: this.llm.name,
            model: this.llm.model
          });
          next = setStatus(next, "OUTLINE_READY");
          return this.store.save(next);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return this.store.save(failStage(run, "outline", message));
        }
      }
      async updateOutline(id, outlineInput) {
        const run = await this.store.require(id);
        if (!EDITABLE_STATUSES.includes(run.status) && run.status !== "OUTLINE_READY") {
          throw new Error(`Cannot edit outline in status ${run.status}`);
        }
        const outline = BlogOutlineSchema.parse(outlineInput);
        return this.store.save({
          ...run,
          outline,
          status: "OUTLINE_READY",
          article: null,
          quality: null
        });
      }
      async generate(id, options = {}) {
        return withRunLock(id, () => this.generateUnlocked(id, options));
      }
      async generateUnlocked(id, options = {}) {
        let run = await this.store.require(id);
        if (options.snapshot) {
          run = {
            ...run,
            analysis: run.analysis ?? options.snapshot.analysis,
            outline: run.outline ?? options.snapshot.outline,
            sources: run.sources.length ? run.sources : options.snapshot.sources
          };
        }
        if (!run.outline || !run.analysis) {
          return this.store.save(
            failStage(
              startStage(run, "generation"),
              "generation",
              "Outline and analysis are required before generation"
            )
          );
        }
        const analysis = run.analysis;
        const outline = run.outline;
        if (typeof options.generateImages === "boolean") {
          run = await this.store.save({ ...run, generateImages: options.generateImages });
        }
        run = setStatus(
          startStage(run, "generation", { provider: this.llm.name, model: this.llm.model }),
          "GENERATING"
        );
        run = await this.store.save(run);
        try {
          let article = await generationStage(
            run.brief,
            run.sources,
            analysis,
            outline,
            this.llm,
            run.templateMarkdown
          );
          try {
            const { content, linksInjected } = injectAffiliateLinks(article.content);
            if (linksInjected.length > 0) {
              article = { ...article, content };
              logger.info("Affiliate links injected", { count: linksInjected.length, runId: id });
            }
          } catch (e) {
            logger.warn("Affiliate link injection skipped", {
              error: e instanceof Error ? e.message : String(e)
            });
          }
          let next = { ...run, article, quality: null };
          next = completeStage(next, "generation", {
            title: article.title,
            provider: this.llm.name,
            model: this.llm.model
          });
          next = setStatus(next, "DRAFT_READY");
          next = await this.store.save(next);
          if (next.generateImages) {
            next = await this.attachGeneratedImages(next);
          }
          return this.store.save(setStatus(next, "DRAFT_READY"));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return this.store.save(failStage(run, "generation", message));
        }
      }
      async qualityCheck(id) {
        return withRunLock(id, () => this.qualityCheckUnlocked(id));
      }
      async qualityCheckUnlocked(id) {
        let run = await this.store.require(id);
        if (!run.article) {
          return this.store.save(
            failStage(startStage(run, "quality"), "quality", "Article required for quality check")
          );
        }
        const article = run.article;
        run = setStatus(startStage(run, "quality"), "QUALITY_CHECK");
        run = await this.store.save(run);
        try {
          const quality = qualityStage(article, run.sources, run.analysis);
          let next = { ...run, quality };
          next = completeStage(next, "quality", {
            score: quality.score,
            passed: quality.passed,
            issueCount: quality.issues.length
          });
          next = setStatus(next, "REVIEW_REQUIRED");
          return this.store.save(next);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return this.store.save(failStage(run, "quality", message));
        }
      }
      async updateArticle(id, articleInput) {
        const run = await this.store.require(id);
        if (!["DRAFT_READY", "REVIEW_REQUIRED", "APPROVED", "PUBLISH_FAILED"].includes(run.status)) {
          throw new Error(`Cannot edit article in status ${run.status}`);
        }
        const article = GeneratedBlogSchema.parse(articleInput);
        return this.store.save({
          ...run,
          article,
          quality: null,
          status: "DRAFT_READY"
        });
      }
      /** Save Quality-tab edits (draft + destination sites) without resetting review status. */
      async saveReview(id, input) {
        const run = await this.store.require(id);
        if (["PUBLISHED", "CANCELLED"].includes(run.status)) {
          throw new Error(`Cannot edit review in status ${run.status}`);
        }
        if (!run.article && !input.article) {
          throw new Error("No article to save");
        }
        const article = input.article ? GeneratedBlogSchema.parse(input.article) : run.article;
        const publishTargets = input.publishTargets !== void 0 ? parsePublishTargets(input.publishTargets) : run.publishTargets?.length ? run.publishTargets : ["spanwrap"];
        return this.store.save({
          ...run,
          article,
          publishTargets
        });
      }
      async approve(id, notes) {
        const run = await this.store.require(id);
        if (!["REVIEW_REQUIRED", "DRAFT_READY", "QUALITY_CHECK", "PUBLISH_FAILED"].includes(run.status)) {
          throw new Error(`Cannot approve from status ${run.status}`);
        }
        if (!run.article) throw new Error("No article to approve");
        return this.store.save({
          ...run,
          status: "APPROVED",
          reviewNotes: notes ?? run.reviewNotes,
          error: null
        });
      }
      async reject(id, notes) {
        const run = await this.store.require(id);
        return this.store.save({
          ...run,
          status: "REVIEW_REQUIRED",
          reviewNotes: notes ?? "Rejected"
        });
      }
      async cancel(id) {
        const run = await this.store.require(id);
        return this.store.save({ ...run, status: "CANCELLED" });
      }
      async delete(id) {
        return this.store.delete(id);
      }
      async publish(id) {
        let run = await this.store.require(id);
        if (run.status !== "APPROVED" && run.status !== "PUBLISH_FAILED") {
          throw new Error("Publish requires APPROVED (or retry from PUBLISH_FAILED)");
        }
        if (!run.article) throw new Error("No approved article to publish");
        const article = run.article;
        const targets = run.publishTargets?.length ? run.publishTargets : ["spanwrap"];
        run = startStage(run, "publish", {
          provider: this.publisher.name,
          meta: { targets }
        });
        run = await this.store.save(run);
        try {
          const { primary, results } = await publishingStage(
            article,
            this.publisher,
            run.idempotencyKey,
            targets
          );
          const live = results.filter((r) => r.statusCode !== 501);
          let next = {
            ...run,
            publishResult: primary,
            publishResults: results
          };
          if (live.length === 0) {
            next = completeStage(next, "publish", {
              plannedOnly: true,
              targets
            });
            return this.store.save({
              ...next,
              status: "APPROVED",
              error: null,
              publishResult: {
                ...primary,
                message: primary.message || "Selected sites are not wired yet. Draft stays approved."
              }
            });
          }
          const liveFailed = live.find((r) => !r.success);
          if (!liveFailed) {
            next = completeStage(next, "publish", {
              externalId: primary.externalId,
              statusCode: primary.statusCode,
              targets
            });
            next = setStatus(next, "PUBLISHED");
            for (const r of results.filter((r2) => r2.success)) {
              try {
                recordPublish(id, r.target, r.externalId ?? id);
              } catch (e) {
                logger.warn("Analytics record failed", { target: r.target, error: e instanceof Error ? e.message : String(e) });
              }
            }
            if (appConfig.social.autoPromote && article) {
              try {
                const promoResults = await promoteAll({
                  title: article.title,
                  slug: article.slug,
                  excerpt: article.excerpt,
                  tags: article.tags
                });
                logger.info("Auto-promotion complete", { results: promoResults.map((r) => ({ platform: r.platform, success: r.success })) });
              } catch (e) {
                logger.warn("Auto-promotion failed", { error: e instanceof Error ? e.message : String(e) });
              }
            }
          } else {
            next = failStage(
              { ...next, status: "PUBLISH_FAILED" },
              "publish",
              liveFailed.message
            );
            next = {
              ...next,
              status: "PUBLISH_FAILED",
              error: liveFailed.message,
              publishResult: primary,
              publishResults: results
            };
          }
          return this.store.save(next);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const next = {
            ...failStage(run, "publish", message),
            status: "PUBLISH_FAILED",
            error: message
          };
          return this.store.save(next);
        }
      }
      async generateImages(id) {
        const run = await this.store.require(id);
        if (!run.article) throw new Error("Article required for image generation");
        return this.store.save(await this.attachGeneratedImages({ ...run, generateImages: true }));
      }
      async attachGeneratedImages(run) {
        if (!run.article) return run;
        let next = startStage(run, "images", { provider: "gemini" });
        next = await this.store.save(next);
        try {
          const result = await imageStage(next.article, next.id);
          const article = applyGeneratedImages(next.article, result, next.id);
          next = { ...next, article };
          next = completeStage(next, "images", {
            total: (result.sectionImages?.length ?? 0) + (result.heroImage ? 1 : 0) + (result.socialImage ? 1 : 0),
            saved: result.savedPaths.length
          });
          return next;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("Image generation skipped", { error: message });
          const stages = next.stages.map(
            (s) => s.stage === "images" ? { ...s, status: "skipped", error: message, endedAt: (/* @__PURE__ */ new Date()).toISOString() } : s
          );
          return { ...next, stages, error: null };
        }
      }
      /**
       * Convenience: research → outline → generate → quality (stops before approve/publish).
       * Stops at the first failed stage so quality does not run without a draft.
       */
      async runUntilReview(id, options = {}) {
        return withRunLock(id, async () => {
          if (typeof options.generateImages === "boolean") {
            const current = await this.store.require(id);
            await this.store.save({ ...current, generateImages: options.generateImages });
          }
          let run = await this.store.require(id);
          if (!run.analysis || run.sources.length === 0) {
            run = await this.researchUnlocked(id);
            if (run.status === "FAILED" || !run.analysis) {
              return run.status === "FAILED" ? run : this.store.save(
                failStage(
                  startStage(run, "analysis"),
                  "analysis",
                  "Research finished without analysis"
                )
              );
            }
          }
          if (!run.outline) {
            run = await this.outlineUnlocked(id);
            if (run.status === "FAILED" || !run.outline || !run.analysis) {
              return run.status === "FAILED" ? run : this.store.save(
                failStage(
                  startStage(run, "outline"),
                  "outline",
                  run.error || "Outline did not save correctly"
                )
              );
            }
          }
          if (!run.article) {
            run = await this.generateUnlocked(id, { snapshot: run });
            if (run.status === "FAILED" || !run.article) return run;
          }
          return this.qualityCheckUnlocked(id);
        });
      }
    };
  }
});

// src/pipeline/index.ts
var init_pipeline = __esm({
  "src/pipeline/index.ts"() {
    "use strict";
    init_orchestrator();
  }
});

// src/clients/http.ts
async function requestOnce(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? appConfig.requestTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": options.userAgent ?? appConfig.userAgent,
        Accept: options.accept ?? "application/json",
        ...options.headers
      },
      body: options.body,
      redirect: "follow"
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 180);
      } catch {
        detail = "";
      }
      throw new HttpStatusError(response.status, url, detail);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}
async function request(url, options = {}) {
  if (options.retry === false) return requestOnce(url, options);
  return withRetry(() => requestOnce(url, options), {
    maxAttempts: appConfig.retry.maxAttempts,
    baseDelayMs: appConfig.retry.baseDelayMs,
    shouldRetry: (error) => isTransientError(error)
  });
}
async function requestJson(url, options = {}) {
  const response = await request(url, options);
  return await response.json();
}
async function requestText(url, options = {}) {
  const response = await request(url, {
    ...options,
    accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
  });
  return await response.text();
}
var HttpStatusError;
var init_http = __esm({
  "src/clients/http.ts"() {
    "use strict";
    init_config();
    init_retry();
    HttpStatusError = class extends Error {
      status;
      url;
      constructor(status, url, detail) {
        super(detail ? `HTTP ${status} for ${url}: ${detail}` : `HTTP ${status} for ${url}`);
        this.name = "HttpStatusError";
        this.status = status;
        this.url = url;
      }
    };
  }
});

// src/clients/shared.ts
function looksLikeAiTopic(text) {
  return AI_TOPIC_PATTERN.test(text);
}
function parseCompactCount(raw) {
  const text = raw.replace(/,/g, "").trim();
  const match = text.match(/([\d.]+)\s*([kKmMbB])?/);
  if (!match) return 0;
  const n = Number.parseFloat(match[1]);
  if (!Number.isFinite(n)) return 0;
  const suffix = (match[2] ?? "").toLowerCase();
  const mul = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
  return Math.round(n * mul);
}
var AI_TOPIC_PATTERN;
var init_shared = __esm({
  "src/clients/shared.ts"() {
    "use strict";
    AI_TOPIC_PATTERN = /\b(ai|a\.i\.|ml|llm|gpt|openai|anthropic|claude|gemini|huggingface|pytorch|tensorflow|cuda|neural|transformer|diffusion|agentic|machine[- ]?learning|deep[- ]?learning|generative|chatgpt|ollama|langchain)\b/i;
  }
});

// src/clients/github.ts
import * as cheerio2 from "cheerio";
function isoDaysAgo(days, now = /* @__PURE__ */ new Date()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function buildGitHubSearchQueries(opts) {
  const days = opts.days ?? 7;
  const date = isoDaysAgo(days, opts.now);
  const lang = opts.language ? ` language:${opts.language}` : "";
  const topics = (opts.topics?.length ? opts.topics : ["ai", "machine-learning", "llm"]).slice(0, 6);
  const topicQuery = topics.map((t) => `topic:${t}`).join(" OR ");
  const textQuery = [
    "llm",
    "openai",
    '"machine learning"',
    '"generative ai"',
    "pytorch",
    "chatgpt"
  ].join(" OR ");
  return [
    { q: `(${textQuery})${lang} created:>${date} stars:>0`, sort: "stars" },
    { q: `(${topicQuery})${lang} created:>${date} stars:>0`, sort: "stars" }
  ];
}
function githubRepoSignal(fullName, opts) {
  const desc = (opts.description ?? "").replace(/\s+/g, " ").trim();
  const language = (opts.language ?? "").trim();
  const starsToday = opts.starsToday ?? 0;
  const stars = opts.stars ?? 0;
  const communityParts = [
    language,
    stars > 0 ? `${stars.toLocaleString("en-US")} stars` : "",
    starsToday > 0 ? `${starsToday.toLocaleString("en-US")} stars today` : ""
  ].filter(Boolean);
  return {
    platform: "github",
    title: fullName,
    url: `https://github.com/${fullName}`,
    // Prefer stars gained today so evergreens (TensorFlow, Transformers) don't dominate.
    score: starsToday > 0 ? starsToday : stars,
    comments: opts.forks ?? 0,
    author: opts.author ?? fullName.split("/")[0],
    community: communityParts.join(" \xB7 ") || "github",
    description: desc || `GitHub repository ${fullName}.`,
    imageUrl: `https://opengraph.githubassets.com/1/${fullName}`,
    capturedAt: opts.capturedAt
  };
}
function parseGitHubTrendingHtml(html, capturedAt) {
  const $ = cheerio2.load(html);
  const signals = [];
  $("article.Box-row").each((_, el) => {
    const $el = $(el);
    const href = ($el.find("h2 a").attr("href") ?? "").trim();
    const fullName = href.replace(/^\/+/, "").split("/").slice(0, 2).join("/");
    if (!fullName.includes("/")) return;
    signals.push(
      githubRepoSignal(fullName, {
        description: $el.find("p").first().text(),
        language: $el.find('[itemprop="programmingLanguage"]').first().text(),
        stars: parseCompactCount($el.find('a[href$="/stargazers"]').first().text()),
        forks: parseCompactCount($el.find('a[href$="/forks"]').first().text()),
        starsToday: parseCompactCount($el.find(".float-sm-right").last().text()),
        capturedAt
      })
    );
  });
  return signals;
}
function rankGitHubSignals(items, limit) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const item of items) {
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  const ai = [];
  const rest = [];
  for (const item of unique) {
    const haystack = `${item.title} ${item.description} ${item.community ?? ""}`;
    if (looksLikeAiTopic(haystack)) ai.push(item);
    else rest.push(item);
  }
  const byHeat = (a, b) => b.score - a.score || b.comments - a.comments;
  ai.sort(byHeat);
  rest.sort(byHeat);
  if (ai.length >= Math.min(3, limit)) return ai.slice(0, limit);
  return [...ai, ...rest].slice(0, limit);
}
function searchHeaders(opts) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return headers;
}
async function searchRepositories(opts, capturedAt) {
  const limit = Math.min(opts.limit ?? 10, 25);
  const queries = buildGitHubSearchQueries({
    days: opts.days,
    language: opts.language,
    topics: opts.topics
  });
  const collected = [];
  const runQuery = async ({ q, sort }) => {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&order=desc&per_page=${limit}`;
    const data = await requestJson(url, {
      headers: searchHeaders(opts),
      userAgent: opts.userAgent,
      timeoutMs: opts.timeoutMs
    });
    for (const repo of data.items ?? []) {
      if (!repo.full_name || !repo.html_url) continue;
      collected.push(
        githubRepoSignal(repo.full_name, {
          description: repo.description ?? "",
          stars: repo.stargazers_count ?? 0,
          forks: repo.forks_count ?? 0,
          language: repo.language ?? (repo.topics ?? []).slice(0, 3).join(", "),
          author: repo.owner?.login,
          capturedAt
        })
      );
    }
  };
  for (const query of queries) {
    await runQuery(query);
  }
  return rankGitHubSignals(collected, limit);
}
async function scrapeTrendingPages(opts, capturedAt) {
  const limit = Math.min(opts.limit ?? 10, 25);
  const pages = ["https://github.com/trending?since=daily"];
  const parsed = [];
  const results = await Promise.allSettled(
    pages.map(
      (page) => requestText(page, {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        timeoutMs: opts.timeoutMs,
        retry: false
      })
    )
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      parsed.push(...parseGitHubTrendingHtml(result.value, capturedAt));
    }
  }
  return rankGitHubSignals(parsed, limit);
}
async function getTrendingRepos(opts) {
  const source = opts.source ?? "trending";
  const limit = Math.min(opts.limit ?? 10, 25);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let fromTrending = [];
  if (source !== "search") {
    try {
      fromTrending = await scrapeTrendingPages(opts, now);
    } catch {
      fromTrending = [];
    }
  }
  if (fromTrending.length) return fromTrending.slice(0, limit);
  let searchError;
  let fromSearch = [];
  try {
    fromSearch = await searchRepositories(opts, now);
  } catch (error) {
    searchError = error;
  }
  if (fromSearch.length) return fromSearch.slice(0, limit);
  if (searchError) throw searchError;
  return [];
}
var init_github = __esm({
  "src/clients/github.ts"() {
    "use strict";
    init_http();
    init_shared();
    init_shared();
  }
});

// src/clients/reddit.ts
import * as cheerio3 from "cheerio";
function decodeHtmlUrl(url) {
  if (!url) return null;
  const cleaned = url.replace(/&amp;/g, "&").trim();
  if (!cleaned.startsWith("http")) return null;
  if (["self", "default", "nsfw", "spoiler"].includes(cleaned)) return null;
  return cleaned;
}
function mapRedditChild(d, sub, now) {
  if (!d?.title || d.stickied || d.over_18) return null;
  if (d.title.trim().length < 8) return null;
  const haystack = `${d.title} ${d.selftext ?? ""} ${d.subreddit ?? sub}`;
  const aiSub = /machinelearning|localllama|artificial|openai|chatgpt|languagetechnology|datascience|technology/i.test(
    sub
  );
  if (!aiSub && !looksLikeAiTopic(haystack)) return null;
  const permalink = d.permalink ? `https://www.reddit.com${d.permalink}` : void 0;
  const preview = decodeHtmlUrl(d.preview?.images?.[0]?.source?.url);
  const thumb = decodeHtmlUrl(d.thumbnail);
  const link = decodeHtmlUrl(d.url);
  const imageUrl = preview ?? (thumb && /\.(jpg|jpeg|png|gif|webp)/i.test(thumb) ? thumb : null) ?? (link && /\.(jpg|jpeg|png|gif|webp)/i.test(link) ? link : null);
  const description = (d.selftext ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
  return {
    platform: "reddit",
    title: d.title.trim(),
    url: permalink ?? link ?? `https://www.reddit.com/r/${sub}/top/`,
    score: d.score ?? 0,
    comments: d.num_comments ?? 0,
    author: d.author,
    community: `r/${d.subreddit ?? sub}`,
    description: description || d.title.trim(),
    imageUrl,
    capturedAt: now
  };
}
function redditTopUrls(sub, limit) {
  const encoded = encodeURIComponent(sub);
  const n = Math.max(1, Math.min(limit, 25));
  return {
    json: [
      `https://www.reddit.com/r/${encoded}/top.json?t=day&limit=${n}&raw_json=1`,
      `https://www.reddit.com/r/${encoded}/top.json?t=week&limit=${n}&raw_json=1`,
      `https://old.reddit.com/r/${encoded}/top.json?t=day&limit=${n}&raw_json=1`,
      `https://old.reddit.com/r/${encoded}/top.json?t=week&limit=${n}&raw_json=1`
    ],
    html: [
      `https://old.reddit.com/r/${encoded}/top/?t=day`,
      `https://www.reddit.com/r/${encoded}/top/?t=day`
    ]
  };
}
function parseRedditListingHtml(html, sub, capturedAt) {
  const $ = cheerio3.load(html);
  const signals = [];
  $(".thing.link, div.thing").each((_, el) => {
    const $el = $(el);
    if ($el.hasClass("stickied") || $el.attr("data-nsfw") === "true") return;
    const title = ($el.find("a.title").first().text() || $el.find("a[data-event-action='title']").first().text()).trim();
    const permalink = ($el.attr("data-permalink") ?? "").trim();
    const mapped = mapRedditChild(
      {
        title,
        permalink,
        author: ($el.attr("data-author") ?? "").trim(),
        subreddit: ($el.attr("data-subreddit") ?? sub).trim(),
        score: parseCompactCount($el.attr("data-score") ?? $el.find(".score.unvoted").first().text()),
        num_comments: parseCompactCount($el.find("a.comments").first().text()),
        stickied: false,
        over_18: false,
        url: permalink ? `https://www.reddit.com${permalink}` : void 0
      },
      sub,
      capturedAt
    );
    if (mapped) signals.push(mapped);
  });
  return signals;
}
function redditOAuthTopUrl(sub, limit, t = "day") {
  const n = Math.max(1, Math.min(limit, 25));
  return `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/top?limit=${n}&t=${t}`;
}
async function getAccessToken(opts) {
  if (!opts.clientId || !opts.clientSecret) {
    throw new Error("Reddit OAuth requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET");
  }
  if (cachedToken && Date.now() < cachedToken.expiresAt - 6e4) {
    return cachedToken.value;
  }
  const basic = Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64");
  const data = await requestJson(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      userAgent: opts.userAgent,
      timeoutMs: opts.timeoutMs,
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    }
  );
  if (!data.access_token) {
    throw new Error("Reddit OAuth did not return an access_token");
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1e3
  };
  return data.access_token;
}
async function fetchOAuthTop(sub, token, opts, now) {
  const t = opts.time ?? "day";
  const perSub = Math.max(3, Math.ceil((opts.limit ?? 15) / Math.max(1, opts.subreddits?.length ?? 1)));
  const data = await requestJson(redditOAuthTopUrl(sub, perSub, t), {
    userAgent: opts.userAgent,
    timeoutMs: opts.timeoutMs,
    headers: { Authorization: `Bearer ${token}` }
  });
  const signals = [];
  for (const child of data.data?.children ?? []) {
    const mapped = mapRedditChild(child.data, sub, now);
    if (mapped) signals.push(mapped);
  }
  if (signals.length === 0 && t === "day") {
    const weekly = await requestJson(redditOAuthTopUrl(sub, perSub, "week"), {
      userAgent: opts.userAgent,
      timeoutMs: opts.timeoutMs,
      headers: { Authorization: `Bearer ${token}` }
    });
    for (const child of weekly.data?.children ?? []) {
      const mapped = mapRedditChild(child.data, sub, now);
      if (mapped) signals.push(mapped);
    }
  }
  return signals;
}
async function fetchPublicTop(sub, opts, now) {
  const perSub = Math.max(3, Math.ceil((opts.limit ?? 15) / Math.max(1, opts.subreddits?.length ?? 1)));
  const feeds = redditTopUrls(sub, perSub);
  const errors = [];
  for (const path12 of feeds.json) {
    try {
      const data = await requestJson(path12, {
        userAgent: opts.userAgent,
        timeoutMs: opts.timeoutMs,
        retry: false
      });
      const signals = [];
      for (const child of data.data?.children ?? []) {
        const mapped = mapRedditChild(child.data, sub, now);
        if (mapped) signals.push(mapped);
      }
      if (signals.length) return signals;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const path12 of feeds.html) {
    try {
      const html = await requestText(path12, {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        timeoutMs: opts.timeoutMs,
        retry: false
      });
      const parsed = parseRedditListingHtml(html, sub, now);
      if (parsed.length) return parsed;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length) throw new Error(errors[0]);
  return [];
}
async function getTopPosts(opts) {
  const subs = (opts.subreddits?.length ? opts.subreddits : ["artificial", "technology"]).slice(0, 6);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const signals = [];
  const errors = [];
  const useOauth = Boolean(opts.clientId && opts.clientSecret);
  const token = useOauth ? await getAccessToken(opts) : null;
  for (const sub of subs) {
    try {
      const batch = token ? await fetchOAuthTop(sub, token, opts, now) : await fetchPublicTop(sub, opts, now);
      signals.push(...batch);
      await new Promise((r) => setTimeout(r, 250));
    } catch (error) {
      errors.push(`${sub}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (signals.length === 0 && errors.length) {
    const hint = useOauth ? "Reddit OAuth /top failed" : "Reddit /top blocked (set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET)";
    throw new Error(`${hint} (${errors[0]})`);
  }
  return signals;
}
var cachedToken;
var init_reddit = __esm({
  "src/clients/reddit.ts"() {
    "use strict";
    init_shared();
    init_http();
    cachedToken = null;
  }
});

// src/providers/trends/sources.ts
async function fetchJson(url, ctx, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": ctx.userAgent,
        Accept: "application/json",
        ...headers
      },
      redirect: "follow"
    });
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status} for ${url}`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
function decodeHtmlUrl2(url) {
  if (!url) return null;
  const cleaned = url.replace(/&amp;/g, "&").trim();
  if (!cleaned.startsWith("http")) return null;
  if (["self", "default", "nsfw", "spoiler"].includes(cleaned)) return null;
  return cleaned;
}
var HackerNewsTrendProvider, GitHubTrendProvider, RedditTrendProvider, XTrendProvider, DevToTrendProvider, MockTrendProvider;
var init_sources = __esm({
  "src/providers/trends/sources.ts"() {
    "use strict";
    init_github();
    init_reddit();
    init_github();
    init_reddit();
    HackerNewsTrendProvider = class {
      name = "hackernews";
      async discover(ctx) {
        const limit = Math.min(ctx.limit ?? 20, 30);
        const endpoint = ctx.hnQuery ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(ctx.hnQuery)}&tags=story&hitsPerPage=${limit}` : `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`;
        const data = await fetchJson(endpoint, ctx);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        return (data.hits ?? []).filter((h) => h.title && h.title.trim().length > 8).map((h) => ({
          platform: "hackernews",
          title: h.title.trim(),
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID ?? ""}`,
          score: h.points ?? 0,
          comments: h.num_comments ?? 0,
          author: h.author,
          community: "HN",
          description: h.title.trim(),
          imageUrl: "https://news.ycombinator.com/y18.svg",
          capturedAt: now
        }));
      }
    };
    GitHubTrendProvider = class {
      name = "github";
      async discover(ctx) {
        return getTrendingRepos({
          token: ctx.githubToken,
          userAgent: ctx.userAgent,
          timeoutMs: ctx.timeoutMs,
          topics: ctx.githubTopics,
          days: ctx.githubDays,
          language: ctx.githubLanguage,
          source: ctx.githubSource,
          limit: ctx.limit
        });
      }
    };
    RedditTrendProvider = class {
      name = "reddit";
      async discover(ctx) {
        return getTopPosts({
          userAgent: ctx.userAgent,
          timeoutMs: ctx.timeoutMs,
          subreddits: ctx.subreddits,
          limit: ctx.limit,
          clientId: ctx.redditClientId,
          clientSecret: ctx.redditClientSecret
        });
      }
    };
    XTrendProvider = class {
      name = "x";
      async discover(ctx) {
        if (!ctx.xBearerToken) {
          return [];
        }
        const limit = Math.min(Math.max(ctx.limit ?? 10, 10), 20);
        const query = '(AI OR "machine learning" OR LLM OR "generative AI" OR ChatGPT OR OpenAI) lang:en -is:retweet -is:reply';
        const params = new URLSearchParams({
          query,
          max_results: String(limit),
          "tweet.fields": "created_at,public_metrics,text,attachments,author_id",
          expansions: "attachments.media_keys,author_id",
          "media.fields": "url,preview_image_url,type",
          "user.fields": "name,username,profile_image_url"
        });
        const data = await fetchJson(`https://api.twitter.com/2/tweets/search/recent?${params.toString()}`, ctx, {
          Authorization: `Bearer ${ctx.xBearerToken}`
        });
        const mediaByKey = new Map((data.includes?.media ?? []).map((m) => [m.media_key ?? "", m]));
        const userById = new Map((data.includes?.users ?? []).map((u) => [u.id ?? "", u]));
        const now = (/* @__PURE__ */ new Date()).toISOString();
        return (data.data ?? []).filter((t) => t.id && t.text).map((t) => {
          const user = userById.get(t.author_id ?? "");
          const mediaKey = t.attachments?.media_keys?.[0];
          const media = mediaKey ? mediaByKey.get(mediaKey) : void 0;
          const imageUrl = decodeHtmlUrl2(media?.url) ?? decodeHtmlUrl2(media?.preview_image_url) ?? decodeHtmlUrl2(user?.profile_image_url?.replace("_normal", "_bigger")) ?? null;
          const text = t.text.replace(/\s+/g, " ").trim();
          const handle = user?.username ? `@${user.username}` : "x";
          return {
            platform: "x",
            title: text.slice(0, 140),
            url: `https://x.com/${user?.username ?? "i"}/status/${t.id}`,
            score: (t.public_metrics?.like_count ?? 0) + (t.public_metrics?.retweet_count ?? 0) * 2,
            comments: t.public_metrics?.reply_count ?? 0,
            author: handle,
            community: "x/ai",
            description: text.slice(0, 280),
            imageUrl,
            capturedAt: now
          };
        });
      }
    };
    DevToTrendProvider = class {
      name = "devto";
      async discover(ctx) {
        const limit = Math.min(ctx.limit ?? 15, 30);
        const data = await fetchJson(`https://dev.to/api/articles?tag=ai&top=7&per_page=${limit}`, ctx);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        return (data ?? []).filter((a) => a.title && a.url).map((a) => ({
          platform: "devto",
          title: a.title.trim(),
          url: a.url,
          score: a.public_reactions_count ?? 0,
          comments: a.comments_count ?? 0,
          author: a.user?.name,
          community: (a.tag_list ?? []).slice(0, 3).join(", ") || "dev.to",
          description: (a.description ?? a.title ?? "").trim().slice(0, 280),
          imageUrl: decodeHtmlUrl2(a.cover_image) ?? decodeHtmlUrl2(a.social_image) ?? decodeHtmlUrl2(a.user?.profile_image) ?? null,
          capturedAt: now
        }));
      }
    };
    MockTrendProvider = class {
      name = "mock";
      async discover(_ctx) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        return [
          {
            platform: "mock",
            title: "Why AI agents are reshaping B2B customer support",
            url: "https://example.com/mock/ai-agents-support",
            score: 920,
            comments: 140,
            community: "mock/startups",
            description: "Mock discussion of AI agents in B2B support.",
            imageUrl: null,
            capturedAt: now
          },
          {
            platform: "mock",
            title: "Founders debate observability for agent workflows",
            url: "https://example.com/mock/agent-observability",
            score: 640,
            comments: 88,
            community: "mock/engineering",
            description: "Mock thread on observability for agent workflows.",
            imageUrl: null,
            capturedAt: now
          },
          {
            platform: "mock",
            title: "Secure multi-tenant SaaS patterns that still work in 2026",
            url: "https://example.com/mock/saas-multitenant",
            score: 510,
            comments: 62,
            community: "mock/saas",
            description: "Mock thread on multi-tenant SaaS patterns.",
            imageUrl: null,
            capturedAt: now
          }
        ];
      }
    };
  }
});

// src/providers/trends/feeds.ts
function tagText(block, tag) {
  const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"));
  if (cdata?.[1]) return decodeXml(cdata[1]);
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return decodeXml(plain?.[1] ?? "");
}
function attr(block, tag, name) {
  const match = block.match(new RegExp(`<${tag}[^>]*\\s${name}=["']([^"']+)["'][^>]*/?>`, "i"));
  return decodeXml(match?.[1] ?? "");
}
function decodeXml(raw) {
  return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/\s+/g, " ").trim();
}
function parseRssOrAtom(xml) {
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  if (entryBlocks.length) {
    return entryBlocks.map((block) => {
      const link = attr(block, "link", "href") || tagText(block, "id");
      const abs = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
      return {
        title: tagText(block, "title"),
        url: (abs?.[1] || link).trim(),
        description: tagText(block, "summary") || tagText(block, "content"),
        publishedAt: tagText(block, "published") || tagText(block, "updated"),
        author: tagText(block, "name")
      };
    }).filter((item) => item.title && item.url.startsWith("http"));
  }
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return itemBlocks.map((block) => {
    const guid = tagText(block, "guid");
    const link = tagText(block, "link") || (guid.startsWith("http") ? guid : "");
    return {
      title: tagText(block, "title"),
      url: link,
      description: tagText(block, "description") || tagText(block, "content:encoded"),
      publishedAt: tagText(block, "pubDate") || tagText(block, "dc:date"),
      author: tagText(block, "dc:creator") || tagText(block, "author")
    };
  }).filter((item) => item.title && item.url.startsWith("http"));
}
function recencyScore(iso) {
  if (!iso) return 40;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 40;
  const hours = Math.max(0, (Date.now() - t) / 36e5);
  return Math.max(8, Math.round(1200 - hours * 4));
}
function toSignal(item, platform, community, now, score) {
  return {
    platform,
    title: item.title.slice(0, 220),
    url: item.url,
    score: score ?? recencyScore(item.publishedAt),
    comments: 0,
    author: item.author,
    community,
    description: (item.description || item.title).slice(0, 280),
    imageUrl: null,
    capturedAt: now
  };
}
var ArxivTrendProvider, HuggingFacePapersProvider, LobstersTrendProvider, NEWS_FEEDS, NewsRssTrendProvider;
var init_feeds = __esm({
  "src/providers/trends/feeds.ts"() {
    "use strict";
    init_shared();
    init_http();
    ArxivTrendProvider = class {
      name = "arxiv";
      async discover(ctx) {
        const limit = Math.min(ctx.limit ?? 8, 15);
        const url = "https://export.arxiv.org/api/query?search_query=" + encodeURIComponent("cat:cs.AI OR cat:cs.LG OR cat:cs.CL") + `&sortBy=submittedDate&sortOrder=descending&max_results=${limit}`;
        const xml = await requestText(url, {
          timeoutMs: ctx.timeoutMs,
          userAgent: ctx.userAgent,
          accept: "application/atom+xml,application/xml,text/xml"
        });
        const now = (/* @__PURE__ */ new Date()).toISOString();
        return parseRssOrAtom(xml).slice(0, limit).map((item) => toSignal(item, "arxiv", "arXiv cs.AI/LG/CL", now));
      }
    };
    HuggingFacePapersProvider = class {
      name = "huggingface";
      async discover(ctx) {
        const limit = Math.min(ctx.limit ?? 8, 15);
        const data = await requestJson("https://huggingface.co/api/daily_papers", {
          timeoutMs: ctx.timeoutMs,
          userAgent: ctx.userAgent
        });
        const rows = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray(data.papers) ? data.papers : [];
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const items = [];
        for (const row of rows) {
          const rec = row ?? {};
          const paper = rec.paper && typeof rec.paper === "object" ? rec.paper : rec;
          const id = String(paper.id ?? rec.paperId ?? "").trim();
          const title = String(paper.title ?? rec.title ?? "").trim();
          if (!title) continue;
          const url = id ? `https://huggingface.co/papers/${encodeURIComponent(id)}` : typeof rec.url === "string" ? rec.url : "";
          if (!url.startsWith("http")) continue;
          const summary = String(paper.summary ?? rec.summary ?? title).replace(/\s+/g, " ").trim();
          items.push({
            platform: "huggingface",
            title: title.slice(0, 220),
            url,
            score: Number(paper.upvotes ?? rec.upvotes ?? 0) || recencyScore(String(rec.publishedAt ?? "")),
            comments: 0,
            community: "Hugging Face papers",
            description: summary.slice(0, 280),
            imageUrl: null,
            capturedAt: now
          });
        }
        return items.slice(0, limit);
      }
    };
    LobstersTrendProvider = class {
      name = "lobsters";
      async discover(ctx) {
        const limit = Math.min(ctx.limit ?? 8, 15);
        const tags = ["ai", "ml"];
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const batches = await Promise.all(
          tags.map(async (tag) => {
            const rows = await requestJson(`https://lobste.rs/t/${tag}.json`, {
              timeoutMs: ctx.timeoutMs,
              userAgent: ctx.userAgent
            });
            return rows ?? [];
          })
        );
        const seen = /* @__PURE__ */ new Set();
        const items = [];
        for (const row of batches.flat()) {
          const url = row.url || row.short_id_url;
          const title = row.title?.trim();
          if (!title || !url || !url.startsWith("http") || seen.has(url)) continue;
          seen.add(url);
          const author = typeof row.submitter_user === "string" ? row.submitter_user : row.submitter_user?.username;
          items.push({
            platform: "lobsters",
            title,
            url,
            score: row.score ?? 0,
            comments: row.comment_count ?? 0,
            author,
            community: (row.tags ?? []).slice(0, 4).join(", ") || "lobste.rs",
            description: (row.description || title).slice(0, 280),
            imageUrl: null,
            capturedAt: now
          });
        }
        return items.sort((a, b) => b.score - a.score).slice(0, limit);
      }
    };
    NEWS_FEEDS = [
      {
        community: "TechCrunch",
        url: "https://techcrunch.com/category/artificial-intelligence/feed/",
        requireAi: false
      },
      {
        community: "The Verge",
        url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
        requireAi: false
      },
      {
        community: "MIT Technology Review",
        url: "https://www.technologyreview.com/feed/",
        requireAi: true
      },
      {
        community: "Ars Technica",
        url: "https://feeds.arstechnica.com/arstechnica/index",
        requireAi: true
      },
      {
        community: "IEEE Spectrum",
        url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
        requireAi: false
      }
    ];
    NewsRssTrendProvider = class {
      name = "news";
      async discover(ctx) {
        const limit = Math.min(ctx.limit ?? 8, 12);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const results = await Promise.all(
          NEWS_FEEDS.map(async (feed) => {
            try {
              const xml = await requestText(feed.url, {
                timeoutMs: ctx.timeoutMs,
                userAgent: ctx.userAgent,
                accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
                retry: false
              });
              return parseRssOrAtom(xml).filter((item) => feed.requireAi ? looksLikeAiTopic(`${item.title} ${item.description}`) : true).slice(0, 6).map((item) => toSignal(item, "news", feed.community, now));
            } catch {
              return [];
            }
          })
        );
        const seen = /* @__PURE__ */ new Set();
        const merged = [];
        for (const item of results.flat().sort((a, b) => b.score - a.score)) {
          if (!item.url || seen.has(item.url)) continue;
          seen.add(item.url);
          merged.push(item);
        }
        return merged.slice(0, limit);
      }
    };
  }
});

// src/providers/trends/index.ts
function createTrendProviders(names = appConfig.trends.sources) {
  const map = {
    hackernews: () => new HackerNewsTrendProvider(),
    hn: () => new HackerNewsTrendProvider(),
    github: () => new GitHubTrendProvider(),
    reddit: () => new RedditTrendProvider(),
    x: () => new XTrendProvider(),
    twitter: () => new XTrendProvider(),
    devto: () => new DevToTrendProvider(),
    arxiv: () => new ArxivTrendProvider(),
    huggingface: () => new HuggingFacePapersProvider(),
    hf: () => new HuggingFacePapersProvider(),
    lobsters: () => new LobstersTrendProvider(),
    news: () => new NewsRssTrendProvider(),
    mock: () => new MockTrendProvider()
  };
  const providers = [];
  for (const name of names) {
    const factory = map[name];
    if (factory) providers.push(factory());
  }
  if (providers.length === 0) {
    providers.push(new MockTrendProvider());
  }
  return providers;
}
var init_trends = __esm({
  "src/providers/trends/index.ts"() {
    "use strict";
    init_config();
    init_sources();
    init_feeds();
    init_sources();
    init_feeds();
  }
});

// src/services/topic-discovery.ts
function normalizeTitle(title) {
  return title.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
function heatFromSignals(signals) {
  let raw = 0;
  for (const s of signals) {
    raw += Math.log10((s.score || 0) + 10) * 18;
    raw += Math.log10((s.comments || 0) + 5) * 10;
    if (s.platform === "hackernews") raw += 8;
    if (s.platform === "reddit") raw += 4;
    if (s.platform === "devto") raw += 3;
    if (s.platform === "github") raw += 10;
    if (s.platform === "x") raw += 5;
  }
  const platforms = new Set(signals.map((s) => s.platform));
  if (platforms.size > 1) raw += 12;
  return Math.max(1, Math.min(100, Math.round(raw)));
}
function extractKeywords(title) {
  const stop = /* @__PURE__ */ new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "is",
    "are",
    "how",
    "why",
    "what",
    "this",
    "that",
    "from",
    "your",
    "you",
    "we",
    "our",
    "as",
    "at",
    "by",
    "be",
    "it",
    "its"
  ]);
  const words = title.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  return [...new Set(words)].slice(0, 8);
}
function topicFromCluster(signals) {
  const sorted = [...signals].sort((a, b) => a.title.length - b.title.length);
  const base = sorted[0]?.title ?? "Emerging tech topic";
  return base.replace(/\s*[|/].*$/, "").replace(/\s+\(comment.*\)$/i, "").trim().slice(0, 140);
}
function blogAngle(topic, platforms) {
  const where = platforms.join(" + ") || "social discussion";
  return `Explain ${topic} for practitioners who saw it debated on ${where}, with practical takeaways and caveats.`;
}
function whyItMatters(signals) {
  const totalScore = signals.reduce((n, s) => n + (s.score || 0), 0);
  const totalComments = signals.reduce((n, s) => n + (s.comments || 0), 0);
  const communities = [...new Set(signals.map((s) => s.community).filter(Boolean))].slice(0, 3);
  return `Collective engagement ~${totalScore} points / ${totalComments} comments${communities.length ? ` across ${communities.join(", ")}` : ""}.`;
}
async function discoverTopicRecommendations(options = {}) {
  const providers = options.providers ?? (options.offline ? createTrendProviders(["mock"]) : createTrendProviders());
  const ctx = {
    limit: options.limit ?? appConfig.trends.limit,
    subreddits: options.subreddits ?? appConfig.trends.redditSubreddits,
    userAgent: appConfig.userAgent,
    timeoutMs: appConfig.requestTimeoutMs,
    githubToken: appConfig.trends.githubToken,
    xBearerToken: appConfig.trends.xBearerToken,
    githubTopics: appConfig.trends.githubTopics,
    githubDays: appConfig.trends.githubDays,
    githubLanguage: appConfig.trends.githubLanguage,
    githubSource: appConfig.trends.githubSource,
    redditClientId: appConfig.trends.redditClientId,
    redditClientSecret: appConfig.trends.redditClientSecret
  };
  const allSignals = [];
  for (const provider of providers) {
    try {
      const batch = await provider.discover(ctx);
      allSignals.push(...batch);
      logger.info("Trend provider completed", {
        provider: provider.name,
        signals: batch.length
      });
    } catch (error) {
      logger.warn("Trend provider failed", {
        provider: provider.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const clusters = /* @__PURE__ */ new Map();
  for (const signal of allSignals) {
    const key = normalizeTitle(signal.title).split(" ").slice(0, 8).join(" ");
    if (!key) continue;
    const list = clusters.get(key) ?? [];
    list.push(signal);
    clusters.set(key, list);
  }
  const now = /* @__PURE__ */ new Date();
  const expires = new Date(now.getTime() + appConfig.trends.cacheTtlMinutes * 6e4);
  const recommendations = [];
  for (const signals of clusters.values()) {
    const topic = topicFromCluster(signals);
    if (topic.length < 8) continue;
    const platforms = [...new Set(signals.map((s) => s.platform))];
    const heatScore = heatFromSignals(signals);
    recommendations.push(
      TopicRecommendationSchema.parse({
        id: createId("topic"),
        topic,
        summary: signals[0]?.title ?? topic,
        whyItMatters: whyItMatters(signals),
        blogAngle: blogAngle(topic, platforms),
        keywords: extractKeywords(topic),
        heatScore,
        platforms,
        signals: signals.slice(0, 5),
        discoveredAt: now.toISOString(),
        expiresAt: expires.toISOString()
      })
    );
  }
  return recommendations.sort((a, b) => b.heatScore - a.heatScore).slice(0, options.limit ?? appConfig.trends.limit);
}
var init_topic_discovery = __esm({
  "src/services/topic-discovery.ts"() {
    "use strict";
    init_models();
    init_trends();
    init_config();
    init_idempotency();
    init_logger();
  }
});

// src/utils/ttl-cache.ts
var TtlCache;
var init_ttl_cache = __esm({
  "src/utils/ttl-cache.ts"() {
    "use strict";
    TtlCache = class {
      constructor(ttlMs) {
        this.ttlMs = ttlMs;
      }
      ttlMs;
      store = /* @__PURE__ */ new Map();
      get(key) {
        const entry = this.store.get(key);
        if (!entry) return void 0;
        if (Date.now() >= entry.expiresAt) {
          this.store.delete(key);
          return void 0;
        }
        return entry.value;
      }
      set(key, value) {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
      }
      clear() {
        this.store.clear();
      }
    };
  }
});

// src/services/tech-digest.ts
function trendContext(limit) {
  return {
    limit,
    subreddits: appConfig.trends.digestRedditSubreddits,
    userAgent: appConfig.userAgent,
    timeoutMs: appConfig.requestTimeoutMs,
    githubToken: appConfig.trends.githubToken,
    xBearerToken: appConfig.trends.xBearerToken,
    githubTopics: appConfig.trends.githubTopics,
    githubDays: appConfig.trends.githubDays,
    githubLanguage: appConfig.trends.githubLanguage,
    githubSource: appConfig.trends.githubSource,
    redditClientId: appConfig.trends.redditClientId,
    redditClientSecret: appConfig.trends.redditClientSecret
  };
}
function toItem(signal, platform) {
  if (!signal.url || !signal.title) return null;
  try {
    return TechDigestItemSchema.parse({
      platform,
      title: signal.title,
      description: signal.description || signal.title,
      url: signal.url,
      imageUrl: signal.imageUrl ?? null,
      score: signal.score ?? 0,
      comments: signal.comments ?? 0,
      author: signal.author,
      community: signal.community,
      capturedAt: signal.capturedAt
    });
  } catch {
    return null;
  }
}
function mockDigest() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return TechDigestSchema.parse({
    generatedAt: now,
    theme: "AI/ML technology",
    github: [
      {
        platform: "github",
        title: "example/weekly-ai-agent",
        description: "Mock trending AI agent framework topping GitHub stars and forks.",
        url: "https://github.com/example/weekly-ai-agent",
        imageUrl: "https://opengraph.githubassets.com/1/example/weekly-ai-agent",
        score: 4200,
        comments: 310,
        author: "example",
        community: "ai, llm",
        capturedAt: now
      }
    ],
    reddit: [
      {
        platform: "reddit",
        title: "Open-source multimodal model beats last week's baseline",
        description: "Mock r/artificial /top discussion of a new open multimodal release.",
        url: "https://www.reddit.com/r/artificial/top/",
        imageUrl: "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png",
        score: 1800,
        comments: 240,
        author: "mockuser",
        community: "r/artificial",
        capturedAt: now
      }
    ],
    x: [
      {
        platform: "x",
        title: "New paper: smaller LLMs matching frontier tools on agent tasks",
        description: "Mock daily AI thread summarizing a research drop.",
        url: "https://x.com/example/status/1",
        imageUrl: "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png",
        score: 960,
        comments: 88,
        author: "@example",
        community: "x/ai",
        capturedAt: now
      }
    ],
    more: [
      {
        platform: "arxiv",
        title: "Mock: Scaling laws for tool-using language agents",
        description: "Offline stand-in for a new arXiv cs.AI paper.",
        url: "https://arxiv.org/abs/2601.00001",
        imageUrl: null,
        score: 80,
        comments: 0,
        community: "arXiv cs.AI/LG/CL",
        capturedAt: now
      },
      {
        platform: "hackernews",
        title: "Show HN: open evaluation suite for multimodal agents",
        description: "Offline stand-in for an HN AI story.",
        url: "https://news.ycombinator.com/item?id=1",
        imageUrl: null,
        score: 410,
        comments: 90,
        community: "HN",
        capturedAt: now
      }
    ],
    notes: ["Offline mock digest (TRENDS_OFFLINE or --offline)."]
  });
}
async function collect(provider, ctx, platform, limit) {
  try {
    const signals = await provider.discover(ctx);
    const items = signals.map((s) => toItem(s, platform)).filter((item) => Boolean(item)).sort((a, b) => b.score - a.score).slice(0, limit);
    logger.info("Digest provider completed", { provider: provider.name, items: items.length });
    return { items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Digest provider failed", { provider: provider.name, error: message });
    return { items: [], error: `${provider.name}: ${message}` };
  }
}
async function discoverTechDigest(options = {}) {
  if (options.offline) return mockDigest();
  const limit = options.limit ?? appConfig.trends.digestLimit;
  const cacheKey = `digest:${limit}`;
  if (!options.refresh) {
    const cached = digestCache.get(cacheKey);
    if (cached) return cached;
  }
  const ctx = trendContext(limit);
  const extraLimit = Math.max(4, Math.min(limit, 8));
  const [github, reddit, x, hn, devto, arxiv, hf, lobsters, news] = await Promise.all([
    collect(new GitHubTrendProvider(), ctx, "github", Math.max(1, Math.min(limit, 10))),
    collect(new RedditTrendProvider(), ctx, "reddit", limit),
    collect(new XTrendProvider(), ctx, "x", limit),
    collect(
      new HackerNewsTrendProvider(),
      { ...ctx, limit: extraLimit, hnQuery: 'AI OR LLM OR "machine learning"' },
      "hackernews",
      extraLimit
    ),
    collect(new DevToTrendProvider(), { ...ctx, limit: extraLimit }, "devto", extraLimit),
    collect(new ArxivTrendProvider(), { ...ctx, limit: extraLimit }, "arxiv", extraLimit),
    collect(new HuggingFacePapersProvider(), { ...ctx, limit: extraLimit }, "huggingface", extraLimit),
    collect(new LobstersTrendProvider(), { ...ctx, limit: extraLimit }, "lobsters", extraLimit),
    collect(new NewsRssTrendProvider(), { ...ctx, limit: extraLimit }, "news", extraLimit)
  ]);
  const notes = [];
  for (const result of [github, reddit, x, hn, devto, arxiv, hf, lobsters, news]) {
    if (result.error) notes.push(result.error);
  }
  if (!appConfig.trends.xBearerToken) {
    notes.push("X posts skipped \u2014 set X_BEARER_TOKEN (Twitter API v2 bearer) to enable.");
  }
  if (github.items.length === 0 && !github.error) {
    notes.push("No GitHub repos matched daily trending.");
  }
  if (github.error && /403|429|rate limit/i.test(github.error) && !appConfig.trends.githubToken) {
    notes.push("Set GITHUB_TOKEN \u2014 unauthenticated Search is 60 req/hr (Search also 30 req/min).");
  }
  if (reddit.items.length === 0 && !reddit.error && !appConfig.trends.redditClientId) {
    notes.push("Reddit /top is limited without REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET.");
  }
  const seen = /* @__PURE__ */ new Set();
  const more = [];
  for (const item of [...hn.items, ...devto.items, ...arxiv.items, ...hf.items, ...lobsters.items, ...news.items]) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    more.push(item);
  }
  more.sort((a, b) => b.score - a.score);
  const digest = TechDigestSchema.parse({
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    theme: "AI/ML technology",
    github: github.items,
    reddit: reddit.items,
    x: x.items,
    more,
    notes
  });
  digestCache.set(cacheKey, digest);
  return digest;
}
var digestCache;
var init_tech_digest = __esm({
  "src/services/tech-digest.ts"() {
    "use strict";
    init_models();
    init_config();
    init_logger();
    init_trends();
    init_feeds();
    init_ttl_cache();
    digestCache = new TtlCache(appConfig.trends.cacheTtlMinutes * 6e4);
  }
});

// src/services/topic-store.ts
import { mkdir as mkdir4, readdir as readdir3, readFile as readFile3, unlink as unlink2, writeFile as writeFile4 } from "node:fs/promises";
import path8 from "node:path";
function createTopicStore(backend = appConfig.storage.backend) {
  if (backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) throw new Error("MONGODB_URI required for topic store");
    return new MongoTopicStore(uri);
  }
  return new FileTopicStore(appConfig.dataDir);
}
function getTopicStore() {
  if (!defaultTopicStore) defaultTopicStore = createTopicStore();
  return defaultTopicStore;
}
var FileTopicStore, MongoTopicStore, defaultTopicStore;
var init_topic_store = __esm({
  "src/services/topic-store.ts"() {
    "use strict";
    init_config();
    init_models();
    init_mongo_connection();
    FileTopicStore = class {
      constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
      }
      rootDir;
      dir() {
        return path8.join(this.rootDir, "topics");
      }
      filePath(id) {
        return path8.join(this.dir(), `${id}.json`);
      }
      async ensureReady() {
        await mkdir4(this.dir(), { recursive: true });
      }
      async saveMany(topics) {
        await this.ensureReady();
        await this.clear();
        const saved = [];
        for (const t of topics) {
          const parsed = TopicRecommendationSchema.parse(t);
          await writeFile4(this.filePath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
          saved.push(parsed);
        }
        return saved;
      }
      async list() {
        await this.ensureReady();
        const files = await readdir3(this.dir());
        const out = [];
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          const raw = await readFile3(path8.join(this.dir(), file), "utf8");
          out.push(TopicRecommendationSchema.parse(JSON.parse(raw)));
        }
        return out.sort((a, b) => b.heatScore - a.heatScore);
      }
      async get(id) {
        try {
          const raw = await readFile3(this.filePath(id), "utf8");
          return TopicRecommendationSchema.parse(JSON.parse(raw));
        } catch (error) {
          if (error.code === "ENOENT") return null;
          throw error;
        }
      }
      async require(id) {
        const t = await this.get(id);
        if (!t) throw new Error(`Topic recommendation not found: ${id}`);
        return t;
      }
      async clear() {
        await this.ensureReady();
        const files = await readdir3(this.dir());
        await Promise.all(
          files.filter((f) => f.endsWith(".json")).map((f) => unlink2(path8.join(this.dir(), f)).catch(() => void 0))
        );
      }
    };
    MongoTopicStore = class {
      constructor(uri, dbName = appConfig.storage.mongoDb, collectionName = "topic_recommendations") {
        this.uri = uri;
        this.dbName = dbName;
        this.collectionName = collectionName;
      }
      uri;
      dbName;
      collectionName;
      client = null;
      collection = null;
      connecting = null;
      async ensureConnected() {
        if (this.collection) return this.collection;
        if (!this.connecting) {
          this.connecting = (async () => {
            try {
              const { client, db } = await connectMongo(this.uri, this.dbName);
              const col = db.collection(this.collectionName);
              await col.createIndex({ heatScore: -1 });
              this.client = client;
              this.collection = col;
              return col;
            } catch (error) {
              this.client = null;
              this.collection = null;
              this.connecting = null;
              throw error instanceof Error ? error : new Error(formatMongoError(error));
            }
          })();
        }
        return this.connecting;
      }
      filterById(id) {
        return { _id: id };
      }
      toTopic(doc) {
        const raw = doc;
        const { _id, ...rest } = raw;
        return TopicRecommendationSchema.parse({ ...rest, id: String(_id) });
      }
      async saveMany(topics) {
        const col = await this.ensureConnected();
        await col.deleteMany({});
        if (!topics.length) return [];
        const docs = topics.map((t) => {
          const parsed = TopicRecommendationSchema.parse(t);
          return { ...parsed, _id: parsed.id };
        });
        await col.insertMany(docs);
        return topics.map((t) => TopicRecommendationSchema.parse(t));
      }
      async list() {
        const col = await this.ensureConnected();
        const docs = await col.find({}).sort({ heatScore: -1 }).toArray();
        return docs.map((d) => this.toTopic(d));
      }
      async get(id) {
        const col = await this.ensureConnected();
        const doc = await col.findOne(this.filterById(id));
        if (!doc) return null;
        return this.toTopic(doc);
      }
      async require(id) {
        const t = await this.get(id);
        if (!t) throw new Error(`Topic recommendation not found: ${id}`);
        return t;
      }
      async clear() {
        const col = await this.ensureConnected();
        await col.deleteMany({});
      }
      async close() {
        if (this.client) {
          await this.client.close();
          this.client = null;
          this.collection = null;
          this.connecting = null;
        }
      }
    };
    defaultTopicStore = null;
  }
});

// src/services/auth.ts
import {
  createHash as createHash2,
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual
} from "node:crypto";
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { promisify } from "node:util";
import path9 from "node:path";
function normalizeUsername(raw) {
  return raw.trim().toLowerCase();
}
function assertUsername(raw) {
  const username = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Username must be 2\u201340 characters: letters, numbers, dot, underscore, or hyphen");
  }
  return username;
}
function assertPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (password.length > 200) {
    throw new Error("Password is too long");
  }
  return password;
}
async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, salt, 32);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
function getAuthSecret() {
  if (appConfig.auth.secret && appConfig.auth.secret.length >= 16) {
    return appConfig.auth.secret;
  }
  if (process.env.VERCEL) {
    const seed = process.env.MONGODB_URI || process.env.VERCEL_PROJECT_ID || "";
    if (seed.length >= 8) {
      return createHash2("sha256").update(`spanwrap-pipeline-auth:${seed}`).digest("hex");
    }
    throw new Error(
      "AUTH_SECRET is required on Vercel (32+ random characters). Add it in Project \u2192 Environment Variables."
    );
  }
  const filePath2 = path9.join(appConfig.dataDir, "auth-secret");
  try {
    const existing = readFileSync2(filePath2, "utf8").trim();
    if (existing.length >= 16) return existing;
  } catch {
  }
  mkdirSync2(appConfig.dataDir, { recursive: true });
  const generated = randomBytes(32).toString("hex");
  writeFileSync2(filePath2, generated, { encoding: "utf8", mode: 384 });
  return generated;
}
function signSession(username, secret = getAuthSecret(), ttlSec) {
  const days = appConfig.auth.sessionDays;
  const exp = Math.floor(Date.now() / 1e3) + (ttlSec ?? days * 24 * 60 * 60);
  const payload = Buffer.from(JSON.stringify({ u: username, exp })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifySession(token, secret = getAuthSecret()) {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.u !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Math.floor(Date.now() / 1e3)) return null;
    return { username: data.u };
  } catch {
    return null;
  }
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}
function sessionFromRequest(req, secret) {
  const token = parseCookies(req.headers.cookie)[AUTH_COOKIE];
  if (!token) return null;
  try {
    return verifySession(token, secret ?? getAuthSecret());
  } catch {
    return null;
  }
}
function sessionCookieHeader(token, req, maxAgeSec) {
  const days = appConfig.auth.sessionDays;
  const maxAge = maxAgeSec ?? days * 24 * 60 * 60;
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const secure = proto === "https";
  const parts = [
    `${AUTH_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
function clearSessionCookieHeader(req) {
  return sessionCookieHeader("deleted", req, 0);
}
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) return raw.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
function loginRateLimited(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || rec.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_LOGIN_ATTEMPTS;
}
function clearLoginFailures(key) {
  loginAttempts.delete(key);
}
function isAuthUser(value) {
  if (!value || typeof value !== "object") return false;
  const rec = value;
  return typeof rec.username === "string" && typeof rec.passwordHash === "string";
}
function toAuthUser(doc) {
  const rec = doc;
  return {
    username: String(rec.username),
    passwordHash: String(rec.passwordHash),
    createdAt: typeof rec.createdAt === "string" ? rec.createdAt : (/* @__PURE__ */ new Date()).toISOString(),
    lastLoginAt: typeof rec.lastLoginAt === "string" ? rec.lastLoginAt : null
  };
}
function createUserStore() {
  if (appConfig.storage.backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI");
    return new MongoUserStore(uri, appConfig.storage.mongoDb);
  }
  return new FileUserStore(appConfig.dataDir);
}
function getUserStore() {
  if (!defaultStore2) defaultStore2 = createUserStore();
  return defaultStore2;
}
async function ensureSeedUser() {
  if (!seedPromise) {
    seedPromise = (async () => {
      const username = appConfig.auth.username;
      const password = appConfig.auth.password;
      if (!username || !password) return;
      const store = getUserStore();
      if (await store.count() > 0) return;
      try {
        const user = {
          username: assertUsername(username),
          passwordHash: await hashPassword(assertPassword(password)),
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastLoginAt: null
        };
        await store.upsert(user);
        logger.info("Seeded first UI user from AUTH_USERNAME", { username: user.username });
      } catch (error) {
        logger.warn("Could not seed AUTH_USERNAME", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })().catch((error) => {
      seedPromise = null;
      logger.warn("Auth seed failed", {
        error: error instanceof Error ? formatMongoError(error) : String(error)
      });
    });
  }
  await seedPromise;
}
async function createUser(usernameRaw, password) {
  const username = assertUsername(usernameRaw);
  const store = getUserStore();
  if (await store.get(username)) {
    throw new Error("That username is already taken");
  }
  const user = {
    username,
    passwordHash: await hashPassword(assertPassword(password)),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastLoginAt: null
  };
  await store.upsert(user);
  return { username: user.username, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt };
}
async function authenticateUser(usernameRaw, password) {
  const username = normalizeUsername(usernameRaw);
  const store = getUserStore();
  const user = await store.get(username);
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    throw new Error("Invalid username or password");
  }
  const next = { ...user, lastLoginAt: (/* @__PURE__ */ new Date()).toISOString() };
  await store.upsert(next);
  return next;
}
var scrypt, AUTH_COOKIE, USERNAME_PATTERN, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS, loginAttempts, FileUserStore, MongoUserStore, defaultStore2, seedPromise;
var init_auth = __esm({
  "src/services/auth.ts"() {
    "use strict";
    init_config();
    init_mongo_connection();
    init_logger();
    scrypt = promisify(scryptCb);
    AUTH_COOKIE = "sw_session";
    USERNAME_PATTERN = /^[a-zA-Z0-9._-]{2,40}$/;
    MAX_LOGIN_ATTEMPTS = 8;
    LOGIN_WINDOW_MS = 15 * 60 * 1e3;
    loginAttempts = /* @__PURE__ */ new Map();
    FileUserStore = class {
      constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
      }
      rootDir;
      filePath() {
        return path9.join(this.rootDir, "users.json");
      }
      readAll() {
        try {
          const raw = JSON.parse(readFileSync2(this.filePath(), "utf8"));
          if (!Array.isArray(raw.users)) return [];
          return raw.users.filter(isAuthUser);
        } catch {
          return [];
        }
      }
      writeAll(users) {
        mkdirSync2(this.rootDir, { recursive: true });
        writeFileSync2(this.filePath(), JSON.stringify({ users }, null, 2), "utf8");
      }
      async count() {
        return this.readAll().length;
      }
      async get(username) {
        const id = normalizeUsername(username);
        return this.readAll().find((u) => u.username === id) ?? null;
      }
      async list() {
        return this.readAll().map(({ passwordHash: _h, ...rest }) => rest);
      }
      async upsert(user) {
        const users = this.readAll().filter((u) => u.username !== user.username);
        users.push(user);
        this.writeAll(users);
        return user;
      }
    };
    MongoUserStore = class {
      constructor(uri, dbName) {
        this.uri = uri;
        this.dbName = dbName;
      }
      uri;
      dbName;
      collection = null;
      async col() {
        if (this.collection) return this.collection;
        const { db } = await connectMongo(this.uri, this.dbName);
        const col = db.collection("auth_users");
        await col.createIndex({ username: 1 }, { unique: true });
        this.collection = col;
        return col;
      }
      async count() {
        const col = await this.col();
        return col.countDocuments();
      }
      async get(username) {
        const col = await this.col();
        const doc = await col.findOne({ username: normalizeUsername(username) });
        return doc ? toAuthUser(doc) : null;
      }
      async list() {
        const col = await this.col();
        const docs = await col.find({}).sort({ username: 1 }).toArray();
        return docs.map((d) => {
          const u = toAuthUser(d);
          return { username: u.username, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt };
        });
      }
      async upsert(user) {
        const col = await this.col();
        await col.replaceOne({ username: user.username }, user, { upsert: true });
        return user;
      }
    };
    defaultStore2 = null;
    seedPromise = null;
  }
});

// src/services/activity-log.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import path10 from "node:path";
function parseEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw;
  if (typeof rec.id !== "string" || typeof rec.at !== "string" || typeof rec.action !== "string") {
    return null;
  }
  return {
    id: rec.id,
    at: rec.at,
    username: typeof rec.username === "string" ? rec.username : null,
    action: rec.action,
    method: typeof rec.method === "string" ? rec.method : "",
    path: typeof rec.path === "string" ? rec.path : "",
    details: rec.details && typeof rec.details === "object" && !Array.isArray(rec.details) ? rec.details : void 0,
    ip: typeof rec.ip === "string" ? rec.ip : void 0
  };
}
function createActivityLogStore() {
  if (appConfig.storage.backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI");
    return new MongoActivityLogStore(uri, appConfig.storage.mongoDb);
  }
  return new FileActivityLogStore(appConfig.dataDir);
}
function getActivityLogStore() {
  if (!defaultStore3) defaultStore3 = createActivityLogStore();
  return defaultStore3;
}
async function recordActivity(input) {
  try {
    await getActivityLogStore().append(input);
  } catch {
  }
}
var MAX_FILE_ENTRIES, FileActivityLogStore, MongoActivityLogStore, defaultStore3;
var init_activity_log = __esm({
  "src/services/activity-log.ts"() {
    "use strict";
    init_config();
    init_idempotency();
    init_mongo_connection();
    MAX_FILE_ENTRIES = 2e3;
    FileActivityLogStore = class {
      constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
      }
      rootDir;
      filePath() {
        return path10.join(this.rootDir, "activity-log.json");
      }
      readAll() {
        try {
          const raw = JSON.parse(readFileSync3(this.filePath(), "utf8"));
          if (!Array.isArray(raw.entries)) return [];
          return raw.entries.map(parseEntry).filter((e) => Boolean(e));
        } catch {
          return [];
        }
      }
      async append(input) {
        const entry = {
          id: createId("log"),
          at: input.at ?? (/* @__PURE__ */ new Date()).toISOString(),
          username: input.username,
          action: input.action,
          method: input.method,
          path: input.path,
          details: input.details,
          ip: input.ip
        };
        const entries = [entry, ...this.readAll()].slice(0, MAX_FILE_ENTRIES);
        mkdirSync3(this.rootDir, { recursive: true });
        writeFileSync3(this.filePath(), JSON.stringify({ entries }, null, 2), "utf8");
        return entry;
      }
      async list(limit = 100) {
        return this.readAll().slice(0, Math.min(Math.max(limit, 1), 500));
      }
    };
    MongoActivityLogStore = class {
      constructor(uri, dbName) {
        this.uri = uri;
        this.dbName = dbName;
      }
      uri;
      dbName;
      collection = null;
      async col() {
        if (this.collection) return this.collection;
        const { db } = await connectMongo(this.uri, this.dbName);
        const col = db.collection("activity_logs");
        await col.createIndex({ at: -1 });
        this.collection = col;
        return col;
      }
      async append(input) {
        const entry = {
          id: createId("log"),
          at: input.at ?? (/* @__PURE__ */ new Date()).toISOString(),
          username: input.username,
          action: input.action,
          method: input.method,
          path: input.path,
          details: input.details,
          ip: input.ip
        };
        const col = await this.col();
        await col.insertOne({ ...entry, _id: entry.id });
        return entry;
      }
      async list(limit = 100) {
        const col = await this.col();
        const docs = await col.find({}).sort({ at: -1 }).limit(Math.min(Math.max(limit, 1), 500)).toArray();
        return docs.map((d) => parseEntry({ ...d, id: String(d.id ?? d._id) })).filter(
          (e) => Boolean(e)
        );
      }
    };
    defaultStore3 = null;
  }
});

// src/ui-server/index.ts
var ui_server_exports = {};
__export(ui_server_exports, {
  createUiServer: () => createUiServer,
  startUiServer: () => startUiServer
});
import { createServer } from "node:http";
import { readFile as readFile4 } from "node:fs/promises";
import path11 from "node:path";
import { fileURLToPath } from "node:url";
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
function sendJson(res, status, body, extraHeaders) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(payload);
}
function isPublicAuthPath(method, pathname) {
  if (pathname === "/api/auth/me" && method === "GET") return true;
  if (pathname === "/api/auth/login" && method === "POST") return true;
  if (pathname === "/api/auth/setup" && method === "POST") return true;
  return false;
}
async function serveStatic(res, urlPath) {
  if (urlPath === "/settings" || urlPath === "/settings/") {
    urlPath = "/";
  }
  const traced = tracedStatic[urlPath];
  if (traced) {
    try {
      const data = await readFile4(traced);
      const ext = path11.extname(traced.pathname);
      const headers = {
        "Content-Type": MIME[ext] ?? "application/octet-stream"
      };
      if (ext === ".html") headers["Cache-Control"] = "no-store";
      res.writeHead(200, headers);
      res.end(data);
      return;
    } catch {
    }
  }
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  for (const publicDir of publicCandidates) {
    const root = path11.normalize(publicDir);
    const filePath2 = path11.normalize(path11.join(root, rel));
    if (!filePath2.startsWith(root + path11.sep) && filePath2 !== root) {
      continue;
    }
    try {
      const data = await readFile4(filePath2);
      const ext = path11.extname(filePath2);
      const headers = {
        "Content-Type": MIME[ext] ?? "application/octet-stream"
      };
      if (ext === ".html") headers["Cache-Control"] = "no-store";
      res.writeHead(200, headers);
      res.end(data);
      return;
    } catch {
    }
  }
  res.writeHead(404).end("Not found");
}
function orch() {
  return createOrchestrator();
}
async function handleApi(req, res, url) {
  const method = req.method ?? "GET";
  const pathname = url.pathname;
  const ip = clientIp(req);
  try {
    await ensureSeedUser();
    await ensureLlmSettings();
    if (method === "GET" && pathname === "/api/auth/me") {
      const session = sessionFromRequest(req);
      const setupRequired = await getUserStore().count() === 0;
      return sendJson(res, 200, {
        authenticated: Boolean(session),
        username: session?.username ?? null,
        setupRequired
      });
    }
    if (method === "POST" && pathname === "/api/auth/setup") {
      if (await getUserStore().count() > 0) {
        return sendJson(res, 409, { error: "An account already exists. Sign in instead." });
      }
      const body = JSON.parse(await readBody(req) || "{}");
      const created = await createUser(String(body.username ?? ""), String(body.password ?? ""));
      const token = signSession(created.username);
      await recordActivity({
        username: created.username,
        action: "account_setup",
        method,
        path: pathname,
        ip
      });
      return sendJson(res, 201, { username: created.username }, {
        "Set-Cookie": sessionCookieHeader(token, req)
      });
    }
    if (method === "POST" && pathname === "/api/auth/login") {
      const body = JSON.parse(await readBody(req) || "{}");
      const username = String(body.username ?? "");
      const rateKey = `${ip}:${username.trim().toLowerCase()}`;
      if (loginRateLimited(rateKey)) {
        await recordActivity({
          username: username.trim().toLowerCase() || null,
          action: "login_blocked",
          method,
          path: pathname,
          ip
        });
        return sendJson(res, 429, { error: "Too many sign-in attempts. Try again in 15 minutes." });
      }
      try {
        const user = await authenticateUser(username, String(body.password ?? ""));
        clearLoginFailures(rateKey);
        const token = signSession(user.username);
        await recordActivity({
          username: user.username,
          action: "login",
          method,
          path: pathname,
          ip
        });
        return sendJson(res, 200, { username: user.username }, {
          "Set-Cookie": sessionCookieHeader(token, req)
        });
      } catch (error) {
        await recordActivity({
          username: username.trim().toLowerCase() || null,
          action: "login_failed",
          method,
          path: pathname,
          ip
        });
        const message = error instanceof Error ? error.message : "Invalid username or password";
        return sendJson(res, 401, { error: message });
      }
    }
    if (method === "POST" && pathname === "/api/auth/logout") {
      const session = sessionFromRequest(req);
      await recordActivity({
        username: session?.username ?? null,
        action: "logout",
        method,
        path: pathname,
        ip
      });
      return sendJson(res, 200, { ok: true }, {
        "Set-Cookie": clearSessionCookieHeader(req)
      });
    }
    if (!isPublicAuthPath(method, pathname)) {
      const session = sessionFromRequest(req);
      if (!session) {
        return sendJson(res, 401, { error: "Sign in required" });
      }
      return handleAuthedApi(req, res, url, session, ip);
    }
    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("API error", { path: pathname, error: message });
    return sendJson(res, 400, { error: message });
  }
}
async function handleAuthedApi(req, res, url, session, ip) {
  const method = req.method ?? "GET";
  const pathname = url.pathname;
  const log2 = (action, details) => recordActivity({
    username: session.username,
    action,
    method,
    path: pathname,
    ip,
    details
  });
  try {
    if (method === "GET" && pathname === "/api/logs") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 80;
      const entries = await getActivityLogStore().list(Number.isFinite(limit) ? limit : 80);
      return sendJson(res, 200, { entries });
    }
    if (method === "GET" && pathname === "/api/auth/users") {
      const users = await getUserStore().list();
      return sendJson(res, 200, { users });
    }
    if (method === "POST" && pathname === "/api/auth/users") {
      const body = JSON.parse(await readBody(req) || "{}");
      const created = await createUser(String(body.username ?? ""), String(body.password ?? ""));
      await recordActivity({
        username: session.username,
        action: "user_created",
        method,
        path: pathname,
        ip,
        details: { createdUsername: created.username }
      });
      return sendJson(res, 201, created);
    }
    if (method === "GET" && pathname === "/api/health") {
      const llm = getResolvedLlmConfig();
      return sendJson(res, 200, {
        ok: true,
        storage: appConfig.storage.backend,
        llmProvider: llm.provider,
        llmModel: llm.model,
        researchProvider: appConfig.research.provider,
        hasLlmKey: Boolean(llm.apiKey),
        hasSpanwrapKey: Boolean(appConfig.spanwrap.apiKey),
        trendsSources: appConfig.trends.sources,
        hasGithubToken: Boolean(appConfig.trends.githubToken),
        hasRedditOAuth: Boolean(appConfig.trends.redditClientId && appConfig.trends.redditClientSecret),
        hasXBearer: Boolean(appConfig.trends.xBearerToken),
        hasGeminiKey: Boolean(appConfig.images.geminiApiKey)
      });
    }
    if (method === "GET" && pathname === "/api/llm") {
      return sendJson(res, 200, publicLlmStatus());
    }
    if (method === "POST" && pathname === "/api/llm") {
      const body = JSON.parse(await readBody(req) || "{}");
      await saveLlmSettings({
        provider: body.provider,
        model: body.model,
        apiKey: body.apiKey,
        baseUrl: body.baseUrl
      });
      await log2("llm_settings_saved", { provider: body.provider, model: body.model });
      return sendJson(res, 200, publicLlmStatus());
    }
    if ((pathname === "/api/digest" || pathname === "/api/topics/digest" || pathname === "/api/trending") && method === "GET") {
      const offline = url.searchParams.get("offline") === "1" || process.env.TRENDS_OFFLINE === "1";
      const limitRaw = url.searchParams.get("limit");
      const digest = await discoverTechDigest({
        offline,
        refresh: url.searchParams.get("refresh") === "1",
        limit: limitRaw ? Number.parseInt(limitRaw, 10) : void 0
      });
      return sendJson(res, 200, digest);
    }
    if ((pathname === "/api/digest" || pathname === "/api/topics/digest" || pathname === "/api/trending") && method === "POST") {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const offline = body.offline === true || process.env.TRENDS_OFFLINE === "1";
      const digest = await discoverTechDigest({
        offline,
        refresh: body.refresh === true,
        limit: typeof body.limit === "number" ? body.limit : void 0
      });
      if (body.refresh === true) await log2("digest_refreshed");
      return sendJson(res, 200, digest);
    }
    if (pathname === "/api/digest/start-run" && method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      const title = String(body.title ?? "").trim();
      if (title.length < 3) {
        return sendJson(res, 400, { error: "title is required" });
      }
      const description = String(body.description ?? "").trim();
      const sourceUrl = typeof body.url === "string" && body.url.startsWith("http") ? body.url : null;
      const extraKeywords = description.split(/\s+/).map((w) => w.replace(/[^a-zA-Z0-9-]/g, "")).filter((w) => w.length > 3).slice(0, 5);
      const brief = ContentBriefSchema.parse({
        topic: title.slice(0, 140),
        targetAudience: body.targetAudience ?? "startup founders and product teams",
        tone: body.tone ?? "technical but easy to understand",
        contentType: "educational",
        keywords: ["AI", "machine learning", "technology", ...extraKeywords],
        referenceUrls: sourceUrl ? [sourceUrl] : []
      });
      const run = await orch().create(brief, { templateId: body.templateId || null });
      await log2("run_created", { runId: run.id, topic: run.brief.topic, source: "digest" });
      return sendJson(res, 201, { run });
    }
    if (pathname === "/api/topics" && method === "GET") {
      const topics = await getTopicStore().list();
      return sendJson(res, 200, topics);
    }
    if (pathname === "/api/topics/discover" && method === "POST") {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const offline = body.offline === true || process.env.TRENDS_OFFLINE === "1";
      const topics = await discoverTopicRecommendations({
        offline,
        limit: typeof body.limit === "number" ? body.limit : void 0,
        subreddits: Array.isArray(body.subreddits) ? body.subreddits : void 0
      });
      try {
        const saved = await getTopicStore().saveMany(topics);
        await log2("topics_discovered", { count: saved.length });
        return sendJson(res, 200, { count: saved.length, topics: saved });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          message.includes("MongoDB") ? message : `Failed to save topics to storage: ${message}`
        );
      }
    }
    const topicMatch = pathname.match(/^\/api\/topics\/([^/]+)(?:\/(start-run))?$/);
    if (topicMatch) {
      const tid = decodeURIComponent(topicMatch[1]);
      const action = topicMatch[2];
      if (method === "GET" && !action) {
        const topic = await getTopicStore().require(tid);
        return sendJson(res, 200, topic);
      }
      if (method === "POST" && action === "start-run") {
        const topic = await getTopicStore().require(tid);
        const bodyText = await readBody(req);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const brief = ContentBriefSchema.parse({
          topic: topic.topic,
          targetAudience: body.targetAudience ?? "startup founders and product teams",
          tone: body.tone ?? "technical but easy to understand",
          contentType: "educational",
          keywords: topic.keywords.length ? topic.keywords : topic.topic.split(/\s+/).slice(0, 5),
          referenceUrls: topic.signals.map((s) => s.url).filter((u) => Boolean(u)).slice(0, 5)
        });
        const run = await orch().create(brief, {
          templateId: body.templateId || null
        });
        await log2("run_created", { runId: run.id, topic: run.brief.topic, source: "topic" });
        return sendJson(res, 201, { topic, run });
      }
    }
    if (method === "GET" && pathname === "/api/runs") {
      const runs = await orch().list();
      return sendJson(
        res,
        200,
        runs.map((r) => ({
          id: r.id,
          status: r.status,
          topic: r.brief.topic,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
          qualityScore: r.quality?.score ?? null,
          error: r.error
        }))
      );
    }
    if (method === "POST" && pathname === "/api/runs") {
      const raw = JSON.parse(await readBody(req) || "{}");
      const brief = ContentBriefSchema.parse({
        topic: raw.topic,
        targetAudience: raw.targetAudience ?? "general readers",
        tone: raw.tone ?? "clear and professional",
        contentType: raw.contentType ?? "educational",
        keywords: Array.isArray(raw.keywords) ? raw.keywords : typeof raw.keywords === "string" ? raw.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
        referenceUrls: Array.isArray(raw.referenceUrls) ? raw.referenceUrls : []
      });
      const run = await orch().create(brief, {
        templateId: raw.templateId || null
      });
      await log2("run_created", { runId: run.id, topic: run.brief.topic });
      return sendJson(res, 201, run);
    }
    if (pathname === "/api/templates" && method === "GET") {
      const list = await getTemplateStore().list();
      return sendJson(
        res,
        200,
        list.map((t) => ({
          id: t.id,
          name: t.name,
          filename: t.filename,
          updatedAt: t.updatedAt,
          createdAt: t.createdAt,
          notes: t.notes,
          preview: t.markdown.slice(0, 200),
          chars: t.markdown.length
        }))
      );
    }
    if (pathname === "/api/templates" && method === "POST") {
      const raw = JSON.parse(await readBody(req) || "{}");
      const template = await uploadTemplate({
        name: raw.name ?? raw.filename ?? "Untitled template",
        markdown: raw.markdown ?? "",
        filename: raw.filename,
        notes: raw.notes ?? null
      });
      await log2("template_saved", {
        templateId: template.id,
        name: template.name,
        chars: template.markdown.length
      });
      return sendJson(res, 201, template);
    }
    const tplMatch = pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (tplMatch) {
      const tid = decodeURIComponent(tplMatch[1]);
      if (method === "GET") {
        const t = await getTemplateStore().require(tid);
        return sendJson(res, 200, t);
      }
      if (method === "DELETE") {
        const ok = await getTemplateStore().delete(tid);
        if (ok) await log2("template_deleted", { templateId: tid });
        return sendJson(res, ok ? 200 : 404, { deleted: ok });
      }
    }
    const imageMatch = pathname.match(/^\/api\/runs\/([^/]+)\/images\/([^/]+)$/);
    if (imageMatch && method === "GET") {
      const runId = decodeURIComponent(imageMatch[1]);
      const filename = decodeURIComponent(imageMatch[2]);
      if (!/^[\w.-]+$/.test(filename)) {
        return sendJson(res, 400, { error: "Invalid image filename" });
      }
      const filePath2 = path11.join(appConfig.images.outputDir, runId, filename);
      try {
        const buf = await readFile4(filePath2);
        const ext = path11.extname(filename).toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=86400"
        });
        res.end(buf);
        return;
      } catch {
        return sendJson(res, 404, { error: "Image not found" });
      }
    }
    const runMatch = pathname.match(/^\/api\/runs\/([^/]+)(?:\/([^/]+))?$/);
    if (runMatch) {
      const id = decodeURIComponent(runMatch[1]);
      const action = runMatch[2];
      if (method === "GET" && !action) {
        const run = await orch().get(id);
        return sendJson(res, 200, run);
      }
      if (method === "DELETE" && !action) {
        const ok = await orch().delete(id);
        if (ok) await log2("run_deleted", { runId: id });
        return sendJson(res, ok ? 200 : 404, { deleted: ok });
      }
      if (method === "POST" && action) {
        const bodyText = await readBody(req);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const o = orch();
        let run;
        switch (action) {
          case "research":
            run = await o.research(id);
            break;
          case "outline":
            run = await o.outline(id);
            break;
          case "generate":
            run = await o.generate(id, { generateImages: body.generateImages });
            break;
          case "quality-check":
            run = await o.qualityCheck(id);
            break;
          case "run":
            run = await o.runUntilReview(id, { generateImages: body.generateImages });
            break;
          case "approve":
            run = await o.approve(id, body.notes);
            break;
          case "reject":
            run = await o.reject(id, body.notes);
            break;
          case "publish":
            run = await o.publish(id);
            break;
          case "cancel":
            run = await o.cancel(id);
            break;
          case "outline-update":
            run = await o.updateOutline(id, body.outline ?? body);
            break;
          case "article-update":
            run = await o.updateArticle(id, body.article ?? body);
            break;
          case "save-review":
            run = await o.saveReview(id, {
              article: body.article,
              publishTargets: body.publishTargets
            });
            break;
          case "assign-template":
            run = await o.assignTemplate(id, body.templateId ?? null);
            break;
          case "generate-images":
            run = await o.generateImages(id);
            break;
          default:
            return sendJson(res, 404, { error: `Unknown action: ${action}` });
        }
        const actionNames = {
          research: "run_research",
          outline: "run_outline",
          generate: "run_generate",
          "quality-check": "run_quality",
          run: "run_started",
          approve: "run_approved",
          reject: "run_rejected",
          publish: "run_published",
          cancel: "run_cancelled",
          "outline-update": "outline_edited",
          "article-update": "article_edited",
          "save-review": "review_saved",
          "assign-template": "template_assigned"
        };
        await log2(actionNames[action] ?? `run_${action}`, {
          runId: id,
          status: run.status
        });
        return sendJson(res, 200, run);
      }
    }
    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("API error", { path: pathname, error: message });
    return sendJson(res, 400, { error: message });
  }
}
function createUiServer() {
  const host = appConfig.ui.host;
  const port = appConfig.ui.port;
  return createServer((req, res) => {
    void (async () => {
      try {
        const forwardedProto = req.headers["x-forwarded-proto"];
        const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) === "https" ? "https" : "http";
        const origin = req.headers.host ? `${proto}://${req.headers.host}` : `http://${host}:${port}`;
        const url = new URL(req.url ?? "/", origin);
        if (url.pathname.startsWith("/api/")) {
          await handleApi(req, res, url);
          return;
        }
        await serveStatic(res, url.pathname);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Unhandled request error", { error: message });
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Internal Server Error");
        }
      }
    })();
  });
}
function startUiServer() {
  const host = appConfig.ui.host;
  const port = appConfig.ui.port;
  const server = createUiServer();
  server.listen(port, host, () => {
    logger.info("Pipeline UI listening", {
      url: `http://${host}:${port}`,
      storage: appConfig.storage.backend
    });
    console.log(`
Pipeline UI \u2192 http://${host}:${port}
`);
  });
  return server;
}
var moduleDir, publicCandidates, isBundled, getStaticUrl, tracedStatic, MIME;
var init_ui_server = __esm({
  "src/ui-server/index.ts"() {
    "use strict";
    init_config();
    init_models();
    init_pipeline();
    init_logger();
    init_templates();
    init_topic_discovery();
    init_tech_digest();
    init_topic_store();
    init_llm_settings();
    init_auth();
    init_activity_log();
    moduleDir = path11.dirname(fileURLToPath(import.meta.url));
    publicCandidates = [
      path11.join(moduleDir, "public"),
      path11.join(process.cwd(), "public"),
      path11.join(process.cwd(), "src/ui-server/public")
    ];
    isBundled = !import.meta.url.includes("ui-server");
    getStaticUrl = (relPath) => {
      return isBundled ? new URL(`./public/${relPath}`, import.meta.url) : new URL(`../../public/${relPath}`, import.meta.url);
    };
    tracedStatic = {
      "/": getStaticUrl("index.html"),
      "/index.html": getStaticUrl("index.html"),
      "/settings": getStaticUrl("index.html"),
      "/settings/": getStaticUrl("index.html"),
      "/styles.css": getStaticUrl("styles.css"),
      "/app.js": getStaticUrl("app.js")
    };
    MIME = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".json": "application/json"
    };
  }
});

// server.ts
import { createServer as createServer2 } from "node:http";
var maxDuration = 300;
var innerPromise = null;
function getInner() {
  if (!innerPromise) {
    innerPromise = Promise.resolve().then(() => (init_ui_server(), ui_server_exports)).then((m) => m.createUiServer()).catch((error) => {
      innerPromise = null;
      throw error;
    });
  }
  return innerPromise;
}
async function handler(req, res) {
  try {
    const ui = await getInner();
    ui.emit("request", req, res);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("Pipeline boot failure:", message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`Pipeline boot failure

${message}`);
    }
  }
}
var server_default = handler;
if (!process.env.VERCEL) {
  const server = createServer2(handler);
  server.listen(Number(process.env.PORT ?? 8787));
}
export {
  server_default as default,
  maxDuration
};
