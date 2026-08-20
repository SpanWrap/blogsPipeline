import { BlogOutlineSchema, ContentBriefSchema, GeneratedBlogSchema, parsePublishTargets, } from "../models";
import { createLLMProvider } from "../providers/llm";
import { createPublisher } from "../providers/publishing";
import { logger } from "../services/logger";
import { getRunStore } from "../services/storage";
import { getTemplateStore } from "../services/templates";
import { createId, createIdempotencyKey } from "../utils/idempotency";
import { analysisStage, generationStage, imageStage, applyGeneratedImages, outlineStage, publishingStage, qualityStage, researchStage, } from "./stages";
import { completeStage, failStage, setStatus, startStage } from "./state";
import { injectAffiliateLinks } from "../services/affiliate-links";
import { recordPublish } from "../services/analytics";
import { promoteAll } from "../services/social-promotion";
import { appConfig } from "../config";
/** Process-wide lock so two "Run to review" clicks cannot wipe each other's outline/article. */
const runLocks = new Map();
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
    }
    finally {
        release();
        if (runLocks.get(id) === chained)
            runLocks.delete(id);
    }
}
const EDITABLE_STATUSES = [
    "CREATED",
    "RESEARCH_COMPLETE",
    "OUTLINE_READY",
    "DRAFT_READY",
    "REVIEW_REQUIRED",
    "APPROVED",
    "PUBLISH_FAILED",
];
export class BlogPipelineOrchestrator {
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
        const now = new Date().toISOString();
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
            idempotencyKey: createIdempotencyKey([id, brief.topic, "publish"]),
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
                offlineExtract: this.offlineExtract,
            });
            let next = {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error("Research stage failed", { id, error: message });
            const stageName = latest.stages.some((s) => s.stage === "analysis" && s.status === "running")
                ? "analysis"
                : "research";
            return this.store.save(failStage(latest, stageName, message));
        }
    }
    async outline(id) {
        return withRunLock(id, () => this.outlineUnlocked(id));
    }
    async outlineUnlocked(id) {
        let run = await this.store.require(id);
        if (run.sources.length === 0 || !run.analysis) {
            return this.store.save(failStage(startStage(run, "outline"), "outline", "Research + analysis must complete before outline"));
        }
        const analysis = run.analysis;
        run = startStage(run, "outline", { provider: this.llm.name, model: this.llm.model });
        run = await this.store.save(run);
        try {
            const outline = await outlineStage(run.brief, run.sources, analysis, this.llm, run.templateMarkdown);
            let next = {
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
        }
        catch (error) {
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
            quality: null,
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
                sources: run.sources.length ? run.sources : options.snapshot.sources,
            };
        }
        if (!run.outline || !run.analysis) {
            return this.store.save(failStage(startStage(run, "generation"), "generation", "Outline and analysis are required before generation"));
        }
        const analysis = run.analysis;
        const outline = run.outline;
        if (typeof options.generateImages === "boolean") {
            run = await this.store.save({ ...run, generateImages: options.generateImages });
        }
        run = setStatus(startStage(run, "generation", { provider: this.llm.name, model: this.llm.model }), "GENERATING");
        run = await this.store.save(run);
        try {
            let article = await generationStage(run.brief, run.sources, analysis, outline, this.llm, run.templateMarkdown);
            try {
                const { content, linksInjected } = injectAffiliateLinks(article.content);
                if (linksInjected.length > 0) {
                    article = { ...article, content };
                    logger.info("Affiliate links injected", { count: linksInjected.length, runId: id });
                }
            }
            catch (e) {
                logger.warn("Affiliate link injection skipped", {
                    error: e instanceof Error ? e.message : String(e),
                });
            }
            let next = { ...run, article, quality: null };
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
        }
        catch (error) {
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
            return this.store.save(failStage(startStage(run, "quality"), "quality", "Article required for quality check"));
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
                issueCount: quality.issues.length,
            });
            next = setStatus(next, "REVIEW_REQUIRED");
            return this.store.save(next);
        }
        catch (error) {
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
            status: "DRAFT_READY",
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
        const publishTargets = input.publishTargets !== undefined
            ? parsePublishTargets(input.publishTargets)
            : run.publishTargets?.length
                ? run.publishTargets
                : ["spanwrap"];
        return this.store.save({
            ...run,
            article,
            publishTargets,
        });
    }
    async approve(id, notes) {
        const run = await this.store.require(id);
        if (!["REVIEW_REQUIRED", "DRAFT_READY", "QUALITY_CHECK", "PUBLISH_FAILED"].includes(run.status)) {
            throw new Error(`Cannot approve from status ${run.status}`);
        }
        if (!run.article)
            throw new Error("No article to approve");
        return this.store.save({
            ...run,
            status: "APPROVED",
            reviewNotes: notes ?? run.reviewNotes,
            error: null,
        });
    }
    async reject(id, notes) {
        const run = await this.store.require(id);
        return this.store.save({
            ...run,
            status: "REVIEW_REQUIRED",
            reviewNotes: notes ?? "Rejected",
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
        if (!run.article)
            throw new Error("No approved article to publish");
        const article = run.article;
        const targets = run.publishTargets?.length
            ? run.publishTargets
            : ["spanwrap"];
        run = startStage(run, "publish", {
            provider: this.publisher.name,
            meta: { targets },
        });
        run = await this.store.save(run);
        try {
            const { primary, results } = await publishingStage(article, this.publisher, run.idempotencyKey, targets);
            const live = results.filter((r) => r.statusCode !== 501);
            let next = {
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
                        message: primary.message ||
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
                        recordPublish(id, r.target, r.externalId ?? id);
                    }
                    catch (e) {
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
                    }
                    catch (e) {
                        logger.warn("Auto-promotion failed", { error: e instanceof Error ? e.message : String(e) });
                    }
                }
            }
            else {
                next = failStage({ ...next, status: "PUBLISH_FAILED" }, "publish", liveFailed.message);
                next = {
                    ...next,
                    status: "PUBLISH_FAILED",
                    error: liveFailed.message,
                    publishResult: primary,
                    publishResults: results,
                };
            }
            return this.store.save(next);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const next = {
                ...failStage(run, "publish", message),
                status: "PUBLISH_FAILED",
                error: message,
            };
            return this.store.save(next);
        }
    }
    async generateImages(id) {
        const run = await this.store.require(id);
        if (!run.article)
            throw new Error("Article required for image generation");
        return this.store.save(await this.attachGeneratedImages({ ...run, generateImages: true }));
    }
    async attachGeneratedImages(run) {
        if (!run.article)
            return run;
        let next = startStage(run, "images", { provider: "gemini" });
        next = await this.store.save(next);
        try {
            const result = await imageStage(next.article, next.id);
            const article = applyGeneratedImages(next.article, result, next.id);
            next = { ...next, article };
            next = completeStage(next, "images", {
                total: (result.sectionImages?.length ?? 0) +
                    (result.heroImage ? 1 : 0) +
                    (result.socialImage ? 1 : 0),
                saved: result.savedPaths.length,
            });
            return next;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn("Image generation skipped", { error: message });
            const stages = next.stages.map((s) => s.stage === "images"
                ? { ...s, status: "skipped", error: message, endedAt: new Date().toISOString() }
                : s);
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
            // Resume from saved artifacts. Re-running research here used to wipe a
            // finished outline, then generate would fail with "outline required".
            if (!run.analysis || run.sources.length === 0) {
                run = await this.researchUnlocked(id);
                if (run.status === "FAILED" || !run.analysis) {
                    return run.status === "FAILED"
                        ? run
                        : this.store.save(failStage(startStage(run, "analysis"), "analysis", "Research finished without analysis"));
                }
            }
            if (!run.outline) {
                run = await this.outlineUnlocked(id);
                if (run.status === "FAILED" || !run.outline || !run.analysis) {
                    return run.status === "FAILED"
                        ? run
                        : this.store.save(failStage(startStage(run, "outline"), "outline", run.error || "Outline did not save correctly"));
                }
            }
            if (!run.article) {
                run = await this.generateUnlocked(id, { snapshot: run });
                if (run.status === "FAILED" || !run.article)
                    return run;
            }
            return this.qualityCheckUnlocked(id);
        });
    }
}
export function createOrchestrator(deps) {
    return new BlogPipelineOrchestrator(deps);
}
