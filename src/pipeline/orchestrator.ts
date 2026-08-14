import {
  BlogOutlineSchema,
  ContentBriefSchema,
  GeneratedBlogSchema,
  type BlogOutline,
  type ContentBrief,
  type GeneratedBlog,
  type PipelineRun,
  type PipelineStatus,
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
  outlineStage,
  publishingStage,
  qualityStage,
  researchStage,
} from "./stages";
import { completeStage, failStage, setStatus, startStage } from "./state";

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
      publishResult: null,
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
      const article = await generationStage(
        run.brief,
        run.sources,
        analysis,
        outline,
        this.llm,
        run.templateMarkdown,
      );
      let next: PipelineRun = { ...run, article, quality: null };
      next = completeStage(next, "generation", {
        title: article.title,
        provider: this.llm.name,
        model: this.llm.model,
      });
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

  async qualityCheck(id: string): Promise<PipelineRun> {
    let run = await this.store.require(id);
    if (!run.article) throw new Error("Article required for quality check");
    const article = run.article;
    run = setStatus(startStage(run, "quality"), "QUALITY_CHECK");
    run = await this.store.save(run);
    try {
      const quality = qualityStage(article, run.sources);
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

    run = startStage(run, "publish", { provider: this.publisher.name });
    run = await this.store.save(run);
    try {
      const result = await publishingStage(
        article,
        this.publisher,
        run.idempotencyKey,
      );
      let next: PipelineRun = { ...run, publishResult: result };
      if (result.success) {
        next = completeStage(next, "publish", {
          externalId: result.externalId,
          statusCode: result.statusCode,
        });
        next = setStatus(next, "PUBLISHED");
      } else {
        next = failStage(
          { ...next, status: "PUBLISH_FAILED" },
          "publish",
          result.message,
        );
        // failStage forces FAILED; restore publish-failed semantics
        next = {
          ...next,
          status: "PUBLISH_FAILED",
          error: result.message,
          publishResult: result,
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
