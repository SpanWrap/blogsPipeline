import type { PublishTarget, PipelineRun } from "../models";
import { appConfig } from "../config";
import { createOrchestrator, type BlogPipelineOrchestrator } from "../pipeline";
import { createLLMProvider } from "../providers/llm";
import { selectAutopilotTopics, type AutopilotTopicPick } from "./topic-selector";
import {
  getAutopilotLogStore,
  newCycleLog,
  type AutopilotCycleLog,
  type AutopilotRunRecord,
} from "./autopilot-log";
import { logger } from "./logger";

export type AutopilotCycleOptions = {
  /** Override configured platforms. */
  platforms?: PublishTarget[];
  /** Override posts per platform. */
  postsPerPlatform?: number;
  /** Override dry-run mode. */
  dryRun?: boolean;
  /** Force offline/mock mode for testing. */
  offline?: boolean;
};

/**
 * Execute one full autopilot cycle:
 *   discover trends → LLM pick topics → create runs → generate → (auto-approve + publish)
 *
 * Returns the cycle log with results for every run created.
 */
export async function runAutopilotCycle(
  options: AutopilotCycleOptions = {},
): Promise<AutopilotCycleLog> {
  const logStore = getAutopilotLogStore();
  const cycle = newCycleLog();
  await logStore.create(cycle);

  const cfg = appConfig.autopilot;
  const platforms = (options.platforms ?? cfg.targetPlatforms) as PublishTarget[];
  const postsPerPlatform = options.postsPerPlatform ?? cfg.postsPerPlatform;
  const dryRun = options.dryRun ?? cfg.dryRun;
  const skipReview = cfg.skipReview;
  const minQuality = cfg.minQualityScore;

  logger.info("Autopilot cycle started", {
    cycleId: cycle.id,
    platforms,
    postsPerPlatform,
    dryRun,
    skipReview,
  });

  try {
    // 1. Gather recent topics to deduplicate against
    const orch = createOrchestrator();
    const recentTopics = await getRecentTopics(orch, cfg.topicDeduplicationDays);

    // 2. Select topics via LLM
    const llm = createLLMProvider();
    const picks = await selectAutopilotTopics({
      platforms,
      postsPerPlatform,
      recentTopics,
      llm,
      offline: options.offline,
    });

    cycle.topicsDiscovered = picks.length > 0 ? picks.length + 5 : 0; // approximate
    cycle.topicsSelected = picks.length;
    await logStore.update(cycle);

    if (picks.length === 0) {
      cycle.status = "completed";
      cycle.completedAt = new Date().toISOString();
      cycle.errors.push("No suitable topics found for this cycle");
      await logStore.update(cycle);
      logger.warn("Autopilot cycle completed with no topics", { cycleId: cycle.id });
      return cycle;
    }

    logger.info("Autopilot: topics selected", {
      cycleId: cycle.id,
      count: picks.length,
      platforms: [...new Set(picks.map((p) => p.targetPlatform))],
    });

    // 3. Create and process pipeline runs for each pick
    for (const pick of picks) {
      const record = await processAutopilotPick(orch, pick, cycle.id, {
        dryRun,
        skipReview,
        minQuality,
        generateImages: cfg.generateImages,
        templateId: cfg.templateId,
      });
      cycle.runsCreated.push(record);

      if (record.status === "PUBLISHED") {
        cycle.runsPublished++;
      } else if (record.status === "REVIEW_REQUIRED") {
        cycle.runsNeedingReview++;
      }

      // Update log after each run so progress is visible
      await logStore.update(cycle);
    }

    cycle.status = "completed";
    cycle.completedAt = new Date().toISOString();
    await logStore.update(cycle);

    logger.info("Autopilot cycle completed", {
      cycleId: cycle.id,
      created: cycle.runsCreated.length,
      published: cycle.runsPublished,
      needsReview: cycle.runsNeedingReview,
      errors: cycle.errors.length,
    });

    return cycle;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cycle.status = "failed";
    cycle.completedAt = new Date().toISOString();
    cycle.errors.push(`Cycle failed: ${message}`);
    await logStore.update(cycle);
    logger.error("Autopilot cycle failed", { cycleId: cycle.id, error: message });
    return cycle;
  }
}

/**
 * Process a single autopilot topic pick through the full pipeline.
 */
async function processAutopilotPick(
  orch: BlogPipelineOrchestrator,
  pick: AutopilotTopicPick,
  cycleId: string,
  options: {
    dryRun: boolean;
    skipReview: boolean;
    minQuality: number;
    generateImages: boolean;
    templateId?: string;
  },
): Promise<AutopilotRunRecord> {
  const record: AutopilotRunRecord = {
    runId: "",
    topic: pick.titleAngle,
    platform: pick.targetPlatform,
    status: "CREATED",
  };

  try {
    // Create the pipeline run
    const created = await orch.create(pick.brief, {
      templateId: options.templateId ?? null,
    });

    record.runId = created.id;

    // Tag it as autopilot-sourced and set publish target
    const store = await import("./storage").then((m) => m.getRunStore());
    await store.save({
      ...created,
      publishTargets: [pick.targetPlatform],
      autopilotSource: {
        cycleId,
        targetPlatform: pick.targetPlatform,
        topicRank: pick.rank,
      },
    });

    logger.info("Autopilot: pipeline run created", {
      runId: created.id,
      topic: pick.titleAngle,
      platform: pick.targetPlatform,
    });

    // Run the pipeline: research → outline → generate → quality
    let run = await orch.runUntilReview(created.id, {
      generateImages: options.generateImages,
    });

    record.status = run.status;

    if (run.status === "FAILED") {
      record.error = run.error ?? "Pipeline failed";
      return record;
    }

    // Auto-approve + publish if configured and quality passes
    if (
      options.skipReview &&
      !options.dryRun &&
      run.status === "REVIEW_REQUIRED" &&
      run.quality &&
      run.quality.score >= options.minQuality &&
      run.quality.passed
    ) {
      run = await orch.approve(created.id, `Autopilot auto-approved (quality=${run.quality.score})`);
      record.status = run.status;

      run = await orch.publish(created.id);
      record.status = run.status;

      if (run.status === "PUBLISH_FAILED") {
        record.error = run.error ?? "Publish failed";
      }

      logger.info("Autopilot: auto-published", {
        runId: created.id,
        platform: pick.targetPlatform,
        status: run.status,
      });
    } else if (options.dryRun) {
      logger.info("Autopilot: dry-run — skipping publish", {
        runId: created.id,
        status: run.status,
        qualityScore: run.quality?.score,
      });
    } else {
      logger.info("Autopilot: awaiting human review", {
        runId: created.id,
        platform: pick.targetPlatform,
        qualityScore: run.quality?.score,
        qualityPassed: run.quality?.passed,
      });
    }

    // Email the completed draft (.md attachment) when Brevo + recipients are configured.
    if (run.article?.content && !options.dryRun) {
      try {
        const { notifyAutopilotDraftEmail } = await import("./autopilot-email");
        const latest = (await store.require(created.id)) as PipelineRun;
        const mail = await notifyAutopilotDraftEmail(latest);
        if (mail.sent) {
          logger.info("Autopilot: draft email sent", {
            runId: created.id,
            messageId: mail.messageId,
          });
        } else if (mail.skipped) {
          logger.info("Autopilot: draft email skipped", {
            runId: created.id,
            reason: mail.skipped,
          });
        } else if (mail.error) {
          logger.warn("Autopilot: draft email failed", {
            runId: created.id,
            error: mail.error,
          });
        }
      } catch (mailError) {
        logger.warn("Autopilot: draft email error", {
          runId: created.id,
          error: mailError instanceof Error ? mailError.message : String(mailError),
        });
      }
    }

    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record.status = "FAILED";
    record.error = message;
    logger.error("Autopilot: run processing failed", {
      topic: pick.titleAngle,
      platform: pick.targetPlatform,
      error: message,
    });
    return record;
  }
}

/**
 * Gather topics from recently created/published pipeline runs for dedup.
 */
async function getRecentTopics(
  orch: BlogPipelineOrchestrator,
  deduplicationDays: number,
): Promise<string[]> {
  try {
    const allRuns = await orch.list();
    const cutoff = new Date(Date.now() - deduplicationDays * 86_400_000).toISOString();
    return allRuns
      .filter((r) => r.createdAt >= cutoff)
      .map((r) => r.brief.topic);
  } catch (error) {
    logger.warn("Autopilot: failed to load recent topics for dedup", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
