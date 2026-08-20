import { z } from "zod";

export const ContentBriefSchema = z.object({
  topic: z.string().min(3),
  targetAudience: z.string().min(1).default("general readers"),
  tone: z.string().min(1).default("clear and professional"),
  contentType: z.string().min(1).default("educational"),
  keywords: z.array(z.string()).default([]),
  referenceUrls: z.array(z.string().url()).default([]),
  /** Named voice preset id (founder, tutorial, opinion, neutral). */
  stylePresetId: z.string().nullable().optional().default(null),
  /** Optional competitor URLs to bias the angle brief. */
  competitorUrls: z.array(z.string().url()).optional().default([]),
});

export type ContentBrief = z.infer<typeof ContentBriefSchema>;
/** Loose create/update input — defaults applied by ContentBriefSchema.parse. */
export type ContentBriefInput = {
  topic: string;
  targetAudience?: string;
  tone?: string;
  contentType?: string;
  keywords?: string[];
  referenceUrls?: string[];
  stylePresetId?: string | null;
  competitorUrls?: string[];
};

export const ArticleTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  filename: z.string().default(""),
  markdown: z.string().min(1),
  notes: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ArticleTemplate = z.infer<typeof ArticleTemplateSchema>;

export const SourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  sourceName: z.string(),
  content: z.string(),
  publishedAt: z.string().nullable().default(null),
  relevanceScore: z.number().min(0).max(1).default(0),
  fetchError: z.string().optional(),
});

export type ResearchSource = z.infer<typeof SourceSchema>;

const CLAIM_CATEGORIES = [
  "fact",
  "statistic",
  "argument",
  "example",
  "viewpoint",
  "terminology",
  "quote",
  "verification_needed",
] as const;

/** LLMs often invent close-but-invalid categories; coerce instead of failing the whole run. */
function coerceClaimCategory(value: unknown): (typeof CLAIM_CATEGORIES)[number] {
  if (typeof value !== "string") return "fact";
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((CLAIM_CATEGORIES as readonly string[]).includes(v)) {
    return v as (typeof CLAIM_CATEGORIES)[number];
  }
  if (v.includes("stat")) return "statistic";
  if (v.includes("argu")) return "argument";
  if (v.includes("example") || v.includes("case_study") || v.includes("anecdote")) return "example";
  if (v.includes("view") || v.includes("opinion") || v.includes("perspective")) return "viewpoint";
  if (v.includes("term") || v.includes("defin") || v.includes("glossary")) return "terminology";
  if (v.includes("quote") || v.includes("citation")) return "quote";
  if (v.includes("verif") || v.includes("uncertain") || v.includes("unconfirmed") || v.includes("need")) {
    return "verification_needed";
  }
  return "fact";
}

export const ClaimSchema = z.object({
  claim: z.string().min(1),
  sourceIds: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  category: z.preprocess(coerceClaimCategory, z.enum(CLAIM_CATEGORIES)).default("fact"),
});

export type Claim = z.infer<typeof ClaimSchema>;

export const ResearchAnalysisSchema = z.object({
  summary: z.string(),
  claims: z.array(ClaimSchema),
  keyArguments: z.array(z.string()).default([]),
  competingViewpoints: z.array(z.string()).default([]),
  terminology: z.array(z.string()).default([]),
  sourceRelationships: z
    .array(
      z.object({
        sourceIds: z.array(z.string()),
        relationship: z.string(),
      }),
    )
    .default([]),
});

export type ResearchAnalysis = z.infer<typeof ResearchAnalysisSchema>;

export const OutlineSectionSchema = z.object({
  heading: z.string().min(1),
  purpose: z.string().min(1),
  keyPoints: z.array(z.string()).default([]),
  sourceIds: z.array(z.string()).default([]),
});

export const BlogOutlineSchema = z.object({
  titleCandidates: z.array(z.string()).min(1),
  sections: z.array(OutlineSectionSchema).min(1),
});

export type BlogOutline = z.infer<typeof BlogOutlineSchema>;

export const BlogSourceRefSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  sourceName: z.string().optional(),
});

export const GeneratedBlogSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().default(""),
  slug: z.string().min(1),
  excerpt: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  seoTitle: z.string().min(1),
  seoDescription: z.string().min(1),
  sources: z.array(BlogSourceRefSchema).default([]),
  sourceMap: z
    .array(
      z.object({
        paragraphIndex: z.number().int().nonnegative(),
        sourceIds: z.array(z.string()),
      }),
    )
    .default([]),
  featuredImage: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null)),
});

export type GeneratedBlog = z.infer<typeof GeneratedBlogSchema>;

export const QualityIssueSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  type: z.string(),
  message: z.string(),
});

export const QualityResultSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  issues: z.array(QualityIssueSchema),
});

export type QualityResult = z.infer<typeof QualityResultSchema>;
export type QualityIssue = z.infer<typeof QualityIssueSchema>;

export const PUBLISH_TARGET_VALUES = ["spanwrap", "medium", "devto", "hashnode", "wordpress", "substack"] as const;

export const PublishTargetSchema = z.enum(PUBLISH_TARGET_VALUES);

export type PublishTarget = z.infer<typeof PublishTargetSchema>;

export const PublishResultSchema = z.object({
  success: z.boolean(),
  externalId: z.string().optional(),
  statusCode: z.number().optional(),
  message: z.string(),
  idempotencyKey: z.string(),
  raw: z.unknown().optional(),
  target: PublishTargetSchema.optional(),
});

export type PublishResult = z.infer<typeof PublishResultSchema>;

export const TargetPublishResultSchema = PublishResultSchema.extend({
  target: PublishTargetSchema,
});

export type TargetPublishResult = z.infer<typeof TargetPublishResultSchema>;

export function parsePublishTargets(input: unknown): PublishTarget[] {
  const allowed = new Set<string>(PUBLISH_TARGET_VALUES);
  const unique: PublishTarget[] = [];
  const arr = Array.isArray(input) ? input : [];
  for (const item of arr) {
    if (typeof item !== "string" || !allowed.has(item)) continue;
    const target = item as PublishTarget;
    if (!unique.includes(target)) unique.push(target);
  }
  if (!unique.length) {
    throw new Error("Select at least one publishing target");
  }
  return unique;
}

export const PipelineStatusSchema = z.enum([
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
  "CANCELLED",
]);

export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;

export const StageRecordSchema = z.object({
  stage: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]),
  startedAt: z.string().nullable().default(null),
  endedAt: z.string().nullable().default(null),
  durationMs: z.number().nullable().default(null),
  retryCount: z.number().default(0),
  provider: z.string().optional(),
  model: z.string().optional(),
  error: z.string().nullable().default(null),
  meta: z.record(z.string(), z.unknown()).default({}),
});

export type StageRecord = z.infer<typeof StageRecordSchema>;

export const PipelineRunSchema = z.object({
  id: z.string(),
  status: PipelineStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  brief: ContentBriefSchema,
  /** Optional article template selected for this run (snapshot stored for stable generation). */
  templateId: z.string().nullable().default(null),
  templateName: z.string().nullable().default(null),
  templateMarkdown: z.string().nullable().default(null),
  sources: z.array(SourceSchema).default([]),
  analysis: ResearchAnalysisSchema.nullable().default(null),
  outline: BlogOutlineSchema.nullable().default(null),
  article: GeneratedBlogSchema.nullable().default(null),
  quality: QualityResultSchema.nullable().default(null),
  /** When true, Gemini generates hero/section images after the article draft. */
  generateImages: z.boolean().default(false),
  /** Sites selected in Quality review for the eventual publish step. */
  publishTargets: z.array(PublishTargetSchema).default(["spanwrap"]),
  publishResult: PublishResultSchema.nullable().default(null),
  publishResults: z.array(TargetPublishResultSchema).default([]),
  stages: z.array(StageRecordSchema).default([]),
  reviewNotes: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  /** Which stage caused the failure — lets the UI offer "Retry from X". */
  failedStage: z.string().nullable().default(null),
  /** Machine-readable error code (e.g. "LLM_TIMEOUT", "RATE_LIMIT", "RESEARCH_EMPTY"). */
  errorCode: z.string().nullable().default(null),
  /** True when the error is transient and a retry has a reasonable chance of succeeding. */
  retryable: z.boolean().default(false),
  /** Style preset applied for generation. */
  stylePresetId: z.string().nullable().default(null),
  /** Previous article snapshot for diff review. */
  previousArticle: GeneratedBlogSchema.nullable().default(null),
  /** SEO suggestion pack attached after draft/quality. */
  seoPack: z
    .object({
      primaryKeyword: z.string().optional(),
      longTailKeywords: z.array(z.string()).default([]),
      titles: z.array(z.string()).default([]),
      descriptions: z.array(z.string()).default([]),
      slugSuggestions: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
  /** Hero/thumbnail A/B variants. */
  thumbnailVariants: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
        label: z.string(),
        selected: z.boolean().default(false),
      }),
    )
    .default([]),
  /** Social + newsletter repurpose pack. */
  repurposePack: z
    .object({
      tweet: z.string(),
      linkedInPost: z.string(),
      redditTitle: z.string(),
      redditBody: z.string(),
      newsletterBlurb: z.string(),
      youtubeShortOutline: z.array(z.string()).default([]),
      thread: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
  /** Set when quality auto-accepted the draft. */
  autoAccepted: z.boolean().default(false),
  /** Lightweight revision notes for diff/history UI. */
  articleHistory: z
    .array(
      z.object({
        at: z.string(),
        note: z.string(),
      }),
    )
    .default([]),
  idempotencyKey: z.string(),
});

export type PipelineRun = z.infer<typeof PipelineRunSchema>;

export type PublishableBlog = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  keywords: string[];
  seoTitle: string;
  seoDescription: string;
  featuredImage: string | null;
  publishedAt: string | null;
  sources: Array<{ title: string; url: string; sourceName?: string }>;
};

export * from "./topics";
