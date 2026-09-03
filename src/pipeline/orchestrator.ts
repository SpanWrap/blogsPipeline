import {
  BlogOutlineSchema,
  ContentBriefSchema,
  GeneratedBlogSchema,
  parsePublishTargets,
  type BlogOutline,
  type ContentBrief,
  type ContentBriefInput,
  type GeneratedBlog,
  type PipelineRun,
  type PipelineStatus,
  type PublishTarget,
} from "../models";
import { createLLMProvider, type LLMProvider } from "../providers/llm";
import { createPublisher, type Publisher } from "../providers/publishing";
import type { ResearchProvider } from "../providers/research";
import { logger } from "../services/logger";
import { getRunStore, type RunStore } from "../services/storage";
import { getTemplateStore, type TemplateStore } from "../services/templates";
import { createId, createIdempotencyKey } from "../utils/idempotency";
import {
  analysisStage,
  generationStage,
  imageStage,
  applyGeneratedImages,
  publicImageUrl,
  outlineStage,
  publishingStage,
  qualityStage,
  researchStage,
  streamDraftStage,
  markdownDraftToArticle,
} from "./stages";
import {
  completeStage,
  failStage,
  inFlightAgeMs,
  isInFlightRun,
  markInterrupted,
  setStatus,
  startStage,
} from "./state";
import { injectRelevantAffiliateLinks } from "../services/affiliate-relevance";
import { recordPublish } from "../services/analytics";
import { promoteAll } from "../services/social-promotion";
import { appConfig } from "../config";
import { describeTemplateForPrompt } from "../utils/template";
import { applyStyleLockToBrief, stripBannedPhrases } from "../services/style-presets";
import { readabilityPass } from "../services/readability-pass";
import {
  regenerateSection,
  regenerateSelection,
  listArticleSections,
} from "../services/section-regenerate";
import { buildRepurposePack } from "../services/repurpose";
import { buildSeoPack, applySeoChoice } from "../services/enrichment";
import { saveTemplateMemory, loadTemplateMemory } from "../services/template-memory";
import { buildResumeDashboard } from "../services/resume-dashboard";
import { planCrossPost } from "../services/canonical-rules";
import { diffSummary } from "../services/diff-review";
import { scoreSEO } from "../services/seo-research";
import { buildFactCards, unsourcedClaimCount } from "../services/fact-cards";
import { createQuickEditLLM } from "../providers/llm/quick-edit";

/** Process-wide lock so two "Run to review" clicks cannot wipe each other's outline/article. */
const runLocks = new Map<string, Promise<void>>();

function isRunLockedLocally(id: string): boolean {
  return runLocks.has(id);
}

async function withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const previous = runLocks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
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

export type OrchestratorDeps = {
  store?: RunStore;
  templateStore?: TemplateStore;
  llm?: LLMProvider;
  publisher?: Publisher;
  researchProvider?: ResearchProvider;
  offlineExtract?: boolean;
};

const EDITABLE_STATUSES: PipelineStatus[] = [
  "CREATED",
  "RESEARCH_COMPLETE",
  "OUTLINE_READY",
  "DRAFT_READY",
  "REVIEW_REQUIRED",
  "APPROVED",
  "PUBLISH_FAILED",
];

export type CreateRunOptions = {
  templateId?: string | null;
};

export class BlogPipelineOrchestrator {
  private readonly store: RunStore;
  private readonly templateStore: TemplateStore;
  private readonly llm: LLMProvider;
  private readonly publisher: Publisher;
  private readonly researchProvider?: ResearchProvider;
  private readonly offlineExtract: boolean;

  constructor(deps: OrchestratorDeps = {}) {
    this.store = deps.store ?? getRunStore();
    this.templateStore = deps.templateStore ?? getTemplateStore();
    this.llm = deps.llm ?? createLLMProvider();
    this.publisher = deps.publisher ?? createPublisher();
    this.researchProvider = deps.researchProvider;
    this.offlineExtract = deps.offlineExtract ?? false;
  }

  async create(
    briefInput: ContentBriefInput,
    options: CreateRunOptions = {},
  ): Promise<PipelineRun> {
    let brief = ContentBriefSchema.parse(briefInput);
    const id = createId("run");
    const now = new Date().toISOString();
    let templateId: string | null =
      options.templateId !== undefined ? options.templateId : loadTemplateMemory().lastTemplateId;
    let templateName: string | null = null;
    let templateMarkdown: string | null = null;

    if (templateId) {
      try {
        const tpl = await this.templateStore.require(templateId);
        templateName = tpl.name;
        templateMarkdown = tpl.markdown;
        saveTemplateMemory({ lastTemplateId: templateId });
      } catch {
        templateId = null;
        templateName = null;
        templateMarkdown = null;
      }
    }

    const stylePresetId = brief.stylePresetId ?? loadTemplateMemory().lastStylePresetId;
    if (stylePresetId) {
      const locked = applyStyleLockToBrief(brief, stylePresetId);
      brief = { ...brief, tone: locked.tone, stylePresetId };
      saveTemplateMemory({ lastStylePresetId: stylePresetId });
    }

    const run: PipelineRun = {
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
      stylePresetId: stylePresetId ?? null,
      previousArticle: null,
      seoPack: null,
      thumbnailVariants: [],
      repurposePack: null,
      autoAccepted: false,
      articleHistory: [],
      autopilotSource: null,
      idempotencyKey: createIdempotencyKey([id, brief.topic, "publish"]),
    };
    return this.store.save(run);
  }

  async assignTemplate(id: string, templateId: string | null): Promise<PipelineRun> {
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
        quality: null,
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
      quality: null,
    });
  }

  async get(id: string): Promise<PipelineRun> {
    const run = await this.store.require(id);
    return this.maybeRecoverInterrupted(run);
  }

  async list(): Promise<PipelineRun[]> {
    const runs = await this.store.list();
    const out: PipelineRun[] = [];
    for (const run of runs) {
      out.push(await this.maybeRecoverInterrupted(run));
    }
    return out;
  }

  /**
   * Mark abandoned in-flight runs as FAILED (retryable).
   * Local boot: recover immediately (this process is the only worker).
   * Otherwise: only recover runs older than the LLM timeout (+ grace).
   */
  async recoverInterruptedRuns(options: { force?: boolean } = {}): Promise<number> {
    const force = Boolean(options.force);
    const maxAgeMs = appConfig.llm.requestTimeoutMs + 60_000;
    const runs = await this.store.list();
    let recovered = 0;
    for (const run of runs) {
      if (!isInFlightRun(run)) continue;
      if (isRunLockedLocally(run.id)) continue;
      if (!force && inFlightAgeMs(run) < maxAgeMs) continue;
      await this.store.save(markInterrupted(run));
      recovered += 1;
      logger.warn("Recovered interrupted pipeline run", {
        runId: run.id,
        status: run.status,
        force,
      });
    }
    return recovered;
  }

  private async maybeRecoverInterrupted(run: PipelineRun): Promise<PipelineRun> {
    if (!isInFlightRun(run)) return run;
    if (isRunLockedLocally(run.id)) return run;
    const maxAgeMs = appConfig.llm.requestTimeoutMs + 60_000;
    // After a local process restart, in-memory locks are gone — recover anything
    // that has been sitting mid-stage longer than a short grace (covers refresh races).
    const graceMs = process.env.VERCEL ? maxAgeMs : 15_000;
    if (inFlightAgeMs(run) < graceMs) return run;
    const recovered = markInterrupted(run);
    await this.store.save(recovered);
    logger.warn("Recovered interrupted pipeline run on read", {
      runId: run.id,
      previousStatus: run.status,
      failedStage: recovered.failedStage,
    });
    return recovered;
  }

  async research(id: string): Promise<PipelineRun> {
    return withRunLock(id, () => this.researchUnlocked(id));
  }

  private async researchUnlocked(id: string): Promise<PipelineRun> {
    let run = await this.store.require(id);
    run = await this.store.save(setStatus(startStage(run, "research"), "RESEARCHING"));
    let latest = run;
    try {
      const { sources, providerName } = await researchStage(run.brief, {
        researchProvider: this.researchProvider,
        offlineExtract: this.offlineExtract,
      });
      let next: PipelineRun = {
        ...run,
        sources,
        analysis: null,
        outline: null,
        article: null,
        quality: null,
      };
      next = completeStage(next, "research", {
        sourcesFound: sources.length,
        provider: providerName,
      });
      next = setStatus(next, "RESEARCH_COMPLETE");

      next = startStage(next, "analysis", {
        provider: this.llm.name,
        model: this.llm.model,
      });
      next = await this.store.save(next);
      latest = next;
      const analysis = await analysisStage(next.brief, next.sources, this.llm);
      next = {
        ...next,
        analysis,
      };
      next = completeStage(next, "analysis", {
        claims: analysis.claims.length,
        provider: this.llm.name,
        model: this.llm.model,
      });
      return this.store.save(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Research stage failed", { id, error: message });
      const stageName =
        latest.stages.some((s) => s.stage === "analysis" && s.status === "running")
          ? "analysis"
          : "research";
      return this.store.save(failStage(latest, stageName, message));
    }
  }

  async outline(id: string): Promise<PipelineRun> {
    return withRunLock(id, () => this.outlineUnlocked(id));
  }

  private async outlineUnlocked(id: string): Promise<PipelineRun> {
    let run = await this.store.require(id);
    if (run.sources.length === 0 || !run.analysis) {
      return this.store.save(
        failStage(
          startStage(run, "outline"),
          "outline",
          "Research + analysis must complete before outline",
        ),
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
        run.templateMarkdown,
      );
      let next: PipelineRun = {
        ...run,
        outline,
        article: null,
        quality: null,
      };
      next = completeStage(next, "outline", {
        sections: outline.sections.length,
        provider: this.llm.name,
        model: this.llm.model,
      });
      next = setStatus(next, "OUTLINE_READY");
      return this.store.save(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.store.save(failStage(run, "outline", message));
    }
  }

  async updateOutline(id: string, outlineInput: BlogOutline): Promise<PipelineRun> {
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
      quality: null,
    });
  }

  async generate(id: string, options: { generateImages?: boolean } = {}): Promise<PipelineRun> {
    return withRunLock(id, () => this.generateUnlocked(id, options));
  }

  private async generateUnlocked(
    id: string,
    options: { generateImages?: boolean; snapshot?: PipelineRun } = {},
  ): Promise<PipelineRun> {
    let run = await this.store.require(id);
    if (options.snapshot) {
      run = {
        ...run,
        analysis: run.analysis ?? options.snapshot.analysis,
        outline: run.outline ?? options.snapshot.outline,
        sources: run.sources.length ? run.sources : options.snapshot.sources,
      };
    }
    if (!run.outline || !run.analysis) {
      return this.store.save(
        failStage(
          startStage(run, "generation"),
          "generation",
          "Outline and analysis are required before generation",
        ),
      );
    }
    const analysis = run.analysis;
    const outline = run.outline;
    if (typeof options.generateImages === "boolean") {
      run = await this.store.save({ ...run, generateImages: options.generateImages });
    }
    run = setStatus(
      startStage(run, "generation", { provider: this.llm.name, model: this.llm.model }),
      "GENERATING",
    );
    run = await this.store.save(run);
    try {
      let article = await generationStage(
        run.brief,
        run.sources,
        analysis,
        outline,
        this.llm,
        run.templateMarkdown,
      );

      try {
        const { content, linksInjected } = injectRelevantAffiliateLinks(
          article.content,
          run.brief.topic,
        );
        if (linksInjected.length > 0) {
          article = { ...article, content };
          logger.info("Affiliate links injected", { count: linksInjected.length, runId: id });
        }
      } catch (e) {
        logger.warn("Affiliate link injection skipped", {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      let next: PipelineRun = { ...run, article, quality: null };
      next = completeStage(next, "generation", {
        title: article.title,
        provider: this.llm.name,
        model: this.llm.model,
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

  async qualityCheck(id: string): Promise<PipelineRun> {
    return withRunLock(id, () => this.qualityCheckUnlocked(id));
  }

  private async qualityCheckUnlocked(
    id: string,
    options: { article?: GeneratedBlog | null } = {},
  ): Promise<PipelineRun> {
    let run = await this.store.require(id);
    if (options.article && !run.article) {
      run = await this.store.save({ ...run, article: options.article });
    }
    if (!run.article) {
      return this.store.save(
        failStage(
          startStage(run, "quality"),
          "quality",
          "No draft yet. Click Run to review (or Generate) first, then Quality score.",
        ),
      );
    }
    const article = run.article;
    run = setStatus(startStage(run, "quality"), "QUALITY_CHECK");
    run = await this.store.save(run);
    try {
      const quality = qualityStage(article, run.sources, run.analysis);
      const seoPack = buildSeoPack(article, run.brief.topic);
      const repurposePack = buildRepurposePack({
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        tags: article.tags,
        content: article.content,
      });
      const hasBlocking = quality.issues.some((i) => i.severity === "error");
      const autoOk =
        appConfig.quality.autoAcceptEnabled &&
        quality.score >= appConfig.quality.autoAcceptMinScore &&
        !hasBlocking &&
        unsourcedClaimCount(buildFactCards(run.analysis, run.sources)) <= 2;

      let next: PipelineRun = {
        ...run,
        quality,
        seoPack,
        repurposePack,
        autoAccepted: autoOk,
      };
      next = completeStage(next, "quality", {
        score: quality.score,
        passed: quality.passed,
        issueCount: quality.issues.length,
        autoAccepted: autoOk,
      });
      // Auto-accept moves straight to APPROVED for human-time reduction; otherwise review.
      next = setStatus(next, autoOk ? "APPROVED" : "REVIEW_REQUIRED");
      if (autoOk) {
        next = {
          ...next,
          reviewNotes: next.reviewNotes || `Auto-accepted (score ${quality.score})`,
        };
      }
      return this.store.save(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.store.save(failStage(run, "quality", message));
    }
  }

  async updateArticle(id: string, articleInput: GeneratedBlog): Promise<PipelineRun> {
    const run = await this.store.require(id);
    if (!["DRAFT_READY", "REVIEW_REQUIRED", "APPROVED", "PUBLISH_FAILED"].includes(run.status)) {
      throw new Error(`Cannot edit article in status ${run.status}`);
    }
    const article = GeneratedBlogSchema.parse(articleInput);
    return this.store.save({
      ...run,
      previousArticle: run.article,
      article,
      quality: null,
      status: "DRAFT_READY",
      articleHistory: [
        ...(run.articleHistory ?? []),
        { at: new Date().toISOString(), note: "Manual article edit" },
      ].slice(-20),
    });
  }

  /** Save Quality-tab edits (draft + destination sites) without resetting review status. */
  async saveReview(
    id: string,
    input: { article?: GeneratedBlog; publishTargets?: unknown },
  ): Promise<PipelineRun> {
    const run = await this.store.require(id);
    if (["PUBLISHED", "CANCELLED"].includes(run.status)) {
      throw new Error(`Cannot edit review in status ${run.status}`);
    }
    if (!run.article && !input.article) {
      throw new Error("No article to save");
    }
    const article = input.article ? GeneratedBlogSchema.parse(input.article) : run.article;
    const publishTargets =
      input.publishTargets !== undefined
        ? parsePublishTargets(input.publishTargets)
        : run.publishTargets?.length
          ? run.publishTargets
          : (["spanwrap"] as PublishTarget[]);
    return this.store.save({
      ...run,
      article,
      publishTargets,
    });
  }

  async approve(id: string, notes?: string): Promise<PipelineRun> {
    const run = await this.store.require(id);
    if (!["REVIEW_REQUIRED", "DRAFT_READY", "QUALITY_CHECK", "PUBLISH_FAILED"].includes(run.status)) {
      throw new Error(`Cannot approve from status ${run.status}`);
    }
    if (!run.article) throw new Error("No article to approve");
    return this.store.save({
      ...run,
      status: "APPROVED",
      reviewNotes: notes ?? run.reviewNotes,
      error: null,
    });
  }

  async reject(id: string, notes?: string): Promise<PipelineRun> {
    const run = await this.store.require(id);
    return this.store.save({
      ...run,
      status: "REVIEW_REQUIRED",
      reviewNotes: notes ?? "Rejected",
    });
  }

  async cancel(id: string): Promise<PipelineRun> {
    const run = await this.store.require(id);
    return this.store.save({ ...run, status: "CANCELLED" });
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async publish(id: string): Promise<PipelineRun> {
    let run = await this.store.require(id);
    if (run.status !== "APPROVED" && run.status !== "PUBLISH_FAILED") {
      throw new Error("Publish requires APPROVED (or retry from PUBLISH_FAILED)");
    }
    if (!run.article) throw new Error("No approved article to publish");
    const article = run.article;

    const targets: PublishTarget[] = run.publishTargets?.length
      ? run.publishTargets
      : ["spanwrap"];
    run = startStage(run, "publish", {
      provider: this.publisher.name,
      meta: { targets },
    });
    run = await this.store.save(run);
    try {
      const { primary, results } = await publishingStage(
        article,
        this.publisher,
        run.idempotencyKey,
        targets,
      );
      const live = results.filter((r) => r.statusCode !== 501);
      let next: PipelineRun = {
        ...run,
        publishResult: primary,
        publishResults: results,
      };
      if (live.length === 0) {
        next = completeStage(next, "publish", {
          plannedOnly: true,
          targets,
        });
        return this.store.save({
          ...next,
          status: "APPROVED",
          error: null,
          publishResult: {
            ...primary,
            message:
              primary.message ||
              "Selected sites are not wired yet. Draft stays approved.",
          },
        });
      }
      const liveFailed = live.find((r) => !r.success);
      if (!liveFailed) {
        next = completeStage(next, "publish", {
          externalId: primary.externalId,
          statusCode: primary.statusCode,
          targets,
        });
        next = setStatus(next, "PUBLISHED");

        // Record analytics and auto-promote after successful publish
        for (const r of results.filter((r) => r.success)) {
          try {
            recordPublish(id, r.target!, r.externalId ?? id);
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
              tags: article.tags,
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
          liveFailed.message,
        );
        next = {
          ...next,
          status: "PUBLISH_FAILED",
          error: liveFailed.message,
          publishResult: primary,
          publishResults: results,
        };
      }
      return this.store.save(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const next = {
        ...failStage(run, "publish", message),
        status: "PUBLISH_FAILED" as const,
        error: message,
      };
      return this.store.save(next);
    }
  }

  async generateImages(id: string): Promise<PipelineRun> {
    const run = await this.store.require(id);
    if (!run.article) throw new Error("Article required for image generation");
    return this.store.save(await this.attachGeneratedImages({ ...run, generateImages: true }));
  }

  private async attachGeneratedImages(run: PipelineRun): Promise<PipelineRun> {
    if (!run.article) return run;
    let next = startStage(run, "images", { provider: "gemini" });
    next = await this.store.save(next);
    try {
      const result = await imageStage(next.article!, next.id);
      const article = applyGeneratedImages(next.article!, result, next.id);
      const filenames = result.savedPaths.map((p) => p.split(/[/\\]/).pop()!);
      const heroFile = filenames.find((n) => n.startsWith("hero-"));
      const socialFile = filenames.find((n) => n.startsWith("social-"));
      const sectionFile = filenames.find((n) => n.startsWith("section-"));
      const variants = [
        heroFile
          ? {
              id: "a",
              url: publicImageUrl(next.id, heroFile),
              label: "Hero A",
              selected: true,
            }
          : null,
        socialFile || sectionFile
          ? {
              id: "b",
              url: publicImageUrl(next.id, (socialFile || sectionFile)!),
              label: socialFile ? "Social B" : "Section B",
              selected: !heroFile,
            }
          : null,
      ].filter(Boolean) as PipelineRun["thumbnailVariants"];

      next = {
        ...next,
        article: {
          ...article,
          featuredImage: variants.find((v) => v.selected)?.url ?? article.featuredImage,
        },
        thumbnailVariants: variants,
      };
      next = completeStage(next, "images", {
        total:
          (result.sectionImages?.length ?? 0) +
          (result.heroImage ? 1 : 0) +
          (result.socialImage ? 1 : 0),
        saved: result.savedPaths.length,
        thumbnails: variants.length,
      });
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Image generation skipped", { error: message });
      const stages = next.stages.map((s) =>
        s.stage === "images"
          ? { ...s, status: "skipped" as const, error: message, endedAt: new Date().toISOString() }
          : s,
      );
      return { ...next, stages, error: null };
    }
  }

  /**
   * Primary UI/CLI action.
   * - Fresh or completed runs: full pipeline (research → outline → draft → quality)
   * - FAILED runs: resume from failedStage, keeping earlier artifacts
   * - stopAfter: "outline" stops after outline (batch / advanced flows)
   */
  async runUntilReview(
    id: string,
    options: {
      generateImages?: boolean;
      stopAfter?: "outline" | null;
      forceFull?: boolean;
    } = {},
  ): Promise<PipelineRun> {
    return withRunLock(id, async () => {
      if (typeof options.generateImages === "boolean") {
        const current = await this.store.require(id);
        await this.store.save({ ...current, generateImages: options.generateImages });
      }

      let run = await this.store.require(id);
      const resumeFrom =
        !options.forceFull && run.status === "FAILED" ? run.failedStage : null;

      const skipResearch =
        resumeFrom === "outline" ||
        resumeFrom === "generation" ||
        resumeFrom === "images" ||
        resumeFrom === "quality";
      const skipOutline =
        resumeFrom === "generation" || resumeFrom === "images" || resumeFrom === "quality";
      const skipGenerate = resumeFrom === "quality" && Boolean(run.article);

      if (!skipResearch) {
        run = await this.researchUnlocked(id);
        if (run.status === "FAILED" || !run.analysis || run.sources.length === 0) {
          return run.status === "FAILED"
            ? run
            : this.store.save(
                failStage(
                  startStage(run, "analysis"),
                  "analysis",
                  "Research finished without analysis",
                ),
              );
        }
      } else if (!run.analysis || run.sources.length === 0) {
        run = await this.researchUnlocked(id);
        if (run.status === "FAILED" || !run.analysis) return run;
      }

      if (!skipOutline) {
        run = await this.outlineUnlocked(id);
        if (run.status === "FAILED" || !run.outline || !run.analysis) {
          return run.status === "FAILED"
            ? run
            : this.store.save(
                failStage(
                  startStage(run, "outline"),
                  "outline",
                  run.error || "Outline did not save correctly",
                ),
              );
        }
      } else if (!run.outline) {
        run = await this.outlineUnlocked(id);
        if (run.status === "FAILED" || !run.outline) return run;
      }

      if (options.stopAfter === "outline") {
        return this.store.save(setStatus({ ...run, error: null }, "OUTLINE_READY"));
      }

      if (!skipGenerate) {
        run = await this.generateUnlocked(id, {
          snapshot: run,
          generateImages: options.generateImages,
        });
        if (run.status === "FAILED" || !run.article) return run;
      } else if (!run.article) {
        run = await this.generateUnlocked(id, { snapshot: run });
        if (run.status === "FAILED" || !run.article) return run;
      }

      return this.qualityCheckUnlocked(id, { article: run.article });
    });
  }

  /** Mark generation as running and stream a Markdown draft to the caller (SSE). */
  async streamDraft(
    id: string,
    onDelta: (chunk: string) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<{ markdown: string; run: PipelineRun }> {
    return withRunLock(id, async () => {
      let run = await this.store.require(id);
      if (!run.outline || !run.analysis) {
        throw new Error("Outline and analysis are required before streaming a draft");
      }
      const analysis = run.analysis;
      const outline = run.outline;
      run = setStatus(
        startStage(run, "generation", { provider: this.llm.name, model: this.llm.model }),
        "GENERATING",
      );
      run = await this.store.save(run);

      try {
        const templateGuidance = run.templateMarkdown?.trim()
          ? describeTemplateForPrompt(run.templateMarkdown)
          : null;
        const markdown = await streamDraftStage(
          run.brief,
          run.sources,
          analysis,
          outline,
          this.llm,
          onDelta,
          templateGuidance,
          signal,
        );
        run = await this.store.save({
          ...run,
          // Keep GENERATING until accept/reject; stash draft in reviewNotes marker is awkward —
          // UI holds markdown client-side until accept.
          error: null,
        });
        return { markdown, run };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = await this.store.save(failStage(run, "generation", message));
        throw Object.assign(new Error(message), { run: failed });
      }
    });
  }

  /** Persist an accepted streamed Markdown draft as the run article. */
  async acceptStreamDraft(
    id: string,
    markdown: string,
    options: { generateImages?: boolean } = {},
  ): Promise<PipelineRun> {
    return withRunLock(id, async () => {
      let run = await this.store.require(id);
      if (!run.outline || !run.analysis) {
        throw new Error("Outline and analysis are required before accepting a draft");
      }
      let article = markdownDraftToArticle(markdown, run.brief, run.sources);
      article = {
        ...article,
        content: stripBannedPhrases(article.content, run.stylePresetId ?? run.brief.stylePresetId),
      };
      try {
        const { content, linksInjected } = injectRelevantAffiliateLinks(
          article.content,
          run.brief.topic,
        );
        if (linksInjected.length > 0) {
          article = { ...article, content };
          logger.info("Affiliate links injected", { count: linksInjected.length, runId: id });
        }
      } catch {
        /* optional */
      }

      let next: PipelineRun = {
        ...run,
        previousArticle: run.article,
        article,
        quality: null,
        error: null,
        failedStage: null,
        errorCode: null,
        retryable: false,
        seoPack: buildSeoPack(article, run.brief.topic),
        repurposePack: buildRepurposePack({
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          tags: article.tags,
          content: article.content,
        }),
        articleHistory: [
          ...(run.articleHistory ?? []),
          { at: new Date().toISOString(), note: "Accepted streamed draft" },
        ].slice(-20),
      };
      if (typeof options.generateImages === "boolean") {
        next = { ...next, generateImages: options.generateImages };
      }
      next = completeStage(next, "generation", {
        title: article.title,
        provider: this.llm.name,
        model: this.llm.model,
        streamed: true,
      });
      next = setStatus(next, "DRAFT_READY");
      next = await this.store.save(next);

      if (next.generateImages) {
        next = await this.attachGeneratedImages(next);
        next = await this.store.save(setStatus(next, "DRAFT_READY"));
      }
      return next;
    });
  }

  /** Discard a streamed suggestion and mark generation failed/cancelled for retry. */
  async rejectStreamDraft(id: string, reason = "Draft rejected by reviewer"): Promise<PipelineRun> {
    return withRunLock(id, async () => {
      const run = await this.store.require(id);
      return this.store.save(
        failStage(startStage(run, "generation"), "generation", reason, {
          errorCode: "DRAFT_REJECTED",
          retryable: true,
        }),
      );
    });
  }

  async readabilityPass(id: string): Promise<PipelineRun> {
    return withRunLock(id, async () => {
      const run = await this.store.require(id);
      if (!run.article) throw new Error("Article required for readability pass");
      const article = readabilityPass(run.article);
      return this.store.save({
        ...run,
        previousArticle: run.article,
        article,
        quality: null,
        status: "DRAFT_READY",
        articleHistory: [
          ...(run.articleHistory ?? []),
          { at: new Date().toISOString(), note: "Readability pass" },
        ].slice(-20),
      });
    });
  }

  async regenerateSection(id: string, heading: string): Promise<PipelineRun> {
    return withRunLock(id, async () => {
      const run = await this.store.require(id);
      if (!run.article) throw new Error("Article required");
      const article = await regenerateSection({
        article: run.article,
        heading,
        brief: run.brief,
        outline: run.outline,
        analysis: run.analysis,
        sources: run.sources,
        llm: this.llm,
      });
      return this.store.save({
        ...run,
        previousArticle: run.article,
        article,
        quality: null,
        status: "DRAFT_READY",
        articleHistory: [
          ...(run.articleHistory ?? []),
          { at: new Date().toISOString(), note: `Regenerated section: ${heading}` },
        ].slice(-20),
      });
    });
  }

  /** Quick Edit: rewrite a selected passage with an instruction. */
  async regenerateSelection(
    id: string,
    input: { selectedText: string; instruction: string; content?: string },
  ): Promise<PipelineRun & { replacement: string }> {
    return withRunLock(id, async () => {
      const run = await this.store.require(id);
      if (!run.article) throw new Error("Article required");
      const baseArticle =
        input.content && input.content.trim()
          ? { ...run.article, content: input.content }
          : run.article;
      const { article, replacement } = await regenerateSelection({
        article: baseArticle,
        selectedText: input.selectedText,
        instruction: input.instruction,
        content: baseArticle.content,
        brief: run.brief,
        sources: run.sources,
        llm: createQuickEditLLM(this.llm),
      });
      const saved = await this.store.save({
        ...run,
        previousArticle: run.article,
        article,
        quality: null,
        status: run.status === "APPROVED" || run.status === "PUBLISHED" ? run.status : "DRAFT_READY",
        articleHistory: [
          ...(run.articleHistory ?? []),
          { at: new Date().toISOString(), note: "Quick Edit selection regenerate" },
        ].slice(-20),
      });
      return Object.assign(saved, { replacement });
    });
  }

  async applySeoPack(
    id: string,
    choice: { title?: string; description?: string; slug?: string },
  ): Promise<PipelineRun> {
    const run = await this.store.require(id);
    if (!run.article) throw new Error("Article required");
    const article = applySeoChoice(run.article, choice);
    return this.store.save({
      ...run,
      previousArticle: run.article,
      article,
      seoPack: run.seoPack ?? buildSeoPack(article, run.brief.topic),
    });
  }

  async selectThumbnail(id: string, variantId: string): Promise<PipelineRun> {
    const run = await this.store.require(id);
    if (!run.article) throw new Error("Article required");
    const variants = (run.thumbnailVariants ?? []).map((v) => ({
      ...v,
      selected: v.id === variantId,
    }));
    const chosen = variants.find((v) => v.id === variantId);
    if (!chosen) throw new Error(`Unknown thumbnail variant: ${variantId}`);
    return this.store.save({
      ...run,
      thumbnailVariants: variants,
      article: { ...run.article, featuredImage: chosen.url },
    });
  }

  async refreshPublished(id: string): Promise<PipelineRun> {
    const source = await this.store.require(id);
    if (source.status !== "PUBLISHED" && source.status !== "APPROVED") {
      throw new Error("Refresh is for published or approved runs");
    }
    const created = await this.create(
      {
        ...source.brief,
        topic: source.brief.topic,
        referenceUrls: [
          ...source.brief.referenceUrls,
          ...((source.publishResult as { url?: string } | null)?.url &&
          /^https?:/i.test(String((source.publishResult as { url?: string }).url))
            ? [String((source.publishResult as { url?: string }).url)]
            : []),
        ],
      },
      { templateId: source.templateId },
    );
    return this.store.save({
      ...created,
      reviewNotes: `Refresh of ${source.id}`,
      stylePresetId: source.stylePresetId,
      generateImages: source.generateImages,
      publishTargets: source.publishTargets,
    });
  }

  async distribute(id: string): Promise<PipelineRun> {
    let run = await this.store.require(id);
    if (!run.article) throw new Error("Article required to distribute");
    const plan = planCrossPost(run.publishTargets, run.article.slug);
    if (run.status !== "APPROVED" && run.status !== "PUBLISH_FAILED") {
      run = await this.approve(id, run.reviewNotes ?? "One-click distribute");
    }
    run = await this.publish(id);
    const repurposePack = buildRepurposePack({
      title: run.article!.title,
      slug: run.article!.slug,
      excerpt: run.article!.excerpt,
      tags: run.article!.tags,
      content: run.article!.content,
    });
    return this.store.save({
      ...run,
      repurposePack,
      reviewNotes: [run.reviewNotes, ...plan.notes].filter(Boolean).join(" · "),
    });
  }

  async batchCreateAndRun(
    briefs: ContentBriefInput[],
    options: { generateImages?: boolean; templateId?: string | null } = {},
  ): Promise<PipelineRun[]> {
    const results: PipelineRun[] = [];
    for (const brief of briefs.slice(0, 8)) {
      const created = await this.create(brief, { templateId: options.templateId });
      const run = await this.runUntilReview(created.id, {
        generateImages: options.generateImages,
        stopAfter: "outline",
      });
      results.push(run);
    }
    return results;
  }

  getResumeDashboard(runs?: PipelineRun[]) {
    return buildResumeDashboard(runs ?? []);
  }

  async getDiff(id: string) {
    const run = await this.store.require(id);
    return diffSummary(run.previousArticle, run.article);
  }

  listSections(id: string): Promise<string[]> {
    return this.store.require(id).then((run) => listArticleSections(run.article?.content ?? ""));
  }

  /** Heuristic check used by UI auto-accept of streamed drafts before quality. */
  shouldAutoAcceptMarkdown(markdown: string, topic: string): boolean {
    if (!appConfig.quality.autoAcceptEnabled) return false;
    const fake = {
      title: topic,
      content: markdown,
      seoTitle: topic,
      seoDescription: markdown.slice(0, 150),
      keywords: [],
      slug: "draft",
    };
    const seo = scoreSEO(fake);
    return seo.score >= appConfig.quality.autoAcceptMinScore && seo.issues.every((i) => i.severity !== "error");
  }
}

export function createOrchestrator(deps?: OrchestratorDeps): BlogPipelineOrchestrator {
  return new BlogPipelineOrchestrator(deps);
}
