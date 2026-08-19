import {
  BlogOutlineSchema,
  ContentBriefSchema,
  GeneratedBlogSchema,
  parsePublishTargets,
  type BlogOutline,
  type ContentBrief,
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
  outlineStage,
  publishingStage,
  qualityStage,
  researchStage,
} from "./stages";
import { completeStage, failStage, setStatus, startStage } from "./state";
import { injectAffiliateLinks } from "../services/affiliate-links";
import { recordPublish } from "../services/analytics";
import { promoteAll } from "../services/social-promotion";
import { appConfig } from "../config";

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
    briefInput: ContentBrief,
    options: CreateRunOptions = {},
  ): Promise<PipelineRun> {
    const brief = ContentBriefSchema.parse(briefInput);
    const id = createId("run");
    const now = new Date().toISOString();
    let templateId: string | null = options.templateId ?? null;
    let templateName: string | null = null;
    let templateMarkdown: string | null = null;

    if (templateId) {
      const tpl = await this.templateStore.require(templateId);
      templateName = tpl.name;
      templateMarkdown = tpl.markdown;
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
      publishTargets: ["spanwrap"],
      publishResult: null,
      publishResults: [],
      stages: [],
      reviewNotes: null,
      error: null,
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
    return this.store.require(id);
  }

  async list(): Promise<PipelineRun[]> {
    return this.store.list();
  }

  async research(id: string): Promise<PipelineRun> {
    let run = await this.store.require(id);
    run = await this.store.save(setStatus(startStage(run, "research"), "RESEARCHING"));
    try {
      const { sources, providerName } = await researchStage(run.brief, {
        researchProvider: this.researchProvider,
        offlineExtract: this.offlineExtract,
      });
      let next: PipelineRun = {
        ...run,
        sources,
        // Clear dependent artifacts when research is re-run
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

      // Auto-run analysis after research
      next = startStage(next, "analysis", {
        provider: this.llm.name,
        model: this.llm.model,
      });
      next = await this.store.save(next);
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
      return this.store.save(failStage(run, "research", message));
    }
  }

  async outline(id: string): Promise<PipelineRun> {
    let run = await this.store.require(id);
    if (run.sources.length === 0 || !run.analysis) {
      throw new Error("Research + analysis must complete before outline");
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

  async generate(id: string): Promise<PipelineRun> {
    let run = await this.store.require(id);
    if (!run.outline || !run.analysis) {
      throw new Error("Outline and analysis are required before generation");
    }
    const analysis = run.analysis;
    const outline = run.outline;
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

      // Inject affiliate links into generated content
      try {
        const { content, linksInjected } = injectAffiliateLinks(article.content);
        if (linksInjected.length > 0) {
          article = { ...article, content };
          logger.info("Affiliate links injected", { count: linksInjected.length, runId: id });
        }
      } catch (e) {
        logger.warn("Affiliate link injection skipped", { error: e instanceof Error ? e.message : String(e) });
      }

      let next: PipelineRun = { ...run, article, quality: null };
      next = completeStage(next, "generation", {
        title: article.title,
        provider: this.llm.name,
        model: this.llm.model,
      });

      // Auto-generate images after article generation
      try {
        next = startStage(next, "images", { provider: "gemini" });
        next = await this.store.save(setStatus(next, "DRAFT_READY"));
        const imageResult = await imageStage(article, id);
        if (imageResult.heroImage?.base64 || imageResult.heroImage?.url) {
          const heroUrl = imageResult.heroImage.url ?? imageResult.savedPaths[0] ?? null;
          if (heroUrl && !article.featuredImage) {
            next = { ...next, article: { ...next.article!, featuredImage: heroUrl } };
          }
        }
        next = completeStage(next, "images", {
          total: (imageResult.sectionImages?.length ?? 0) + (imageResult.heroImage ? 1 : 0) + (imageResult.socialImage ? 1 : 0),
          saved: imageResult.savedPaths.length,
        });
      } catch (e) {
        logger.warn("Image generation skipped", { error: e instanceof Error ? e.message : String(e) });
        next = setStatus(next, "DRAFT_READY");
      }

      next = setStatus(next, "DRAFT_READY");
      return this.store.save(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.store.save(failStage(run, "generation", message));
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
      article,
      quality: null,
      status: "DRAFT_READY",
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

  async qualityCheck(id: string): Promise<PipelineRun> {
    let run = await this.store.require(id);
    if (!run.article) throw new Error("Article required for quality check");
    const article = run.article;
    run = setStatus(startStage(run, "quality"), "QUALITY_CHECK");
    run = await this.store.save(run);
    try {
      const quality = qualityStage(article, run.sources, run.analysis);
      let next: PipelineRun = { ...run, quality };
      next = completeStage(next, "quality", {
        score: quality.score,
        passed: quality.passed,
        issueCount: quality.issues.length,
      });
      next = setStatus(next, "REVIEW_REQUIRED");
      return this.store.save(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.store.save(failStage(run, "quality", message));
    }
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
    let run = await this.store.require(id);
    if (!run.article) throw new Error("Article required for image generation");
    const article = run.article;
    run = startStage(run, "images", { provider: "gemini" });
    run = await this.store.save(run);
    try {
      const result = await imageStage(article, id);
      if (result.heroImage?.url && !article.featuredImage) {
        run = { ...run, article: { ...article, featuredImage: result.heroImage.url } };
      }
      run = completeStage(run, "images", {
        total: (result.sectionImages?.length ?? 0) + (result.heroImage ? 1 : 0) + (result.socialImage ? 1 : 0),
        saved: result.savedPaths.length,
      });
      return this.store.save(run);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.store.save(failStage(run, "images", message));
    }
  }

  /**
   * Convenience: research → outline → generate → quality (stops before approve/publish).
   */
  async runUntilReview(id: string): Promise<PipelineRun> {
    await this.research(id);
    await this.outline(id);
    await this.generate(id);
    return this.qualityCheck(id);
  }
}

export function createOrchestrator(deps?: OrchestratorDeps): BlogPipelineOrchestrator {
  return new BlogPipelineOrchestrator(deps);
}
