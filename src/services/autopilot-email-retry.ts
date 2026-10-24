import type { PipelineRun } from "../models";
import { logger } from "./logger";
import { getRunStore } from "./storage";
import { notifyAutopilotDraftEmail } from "./autopilot-email";
import {
  getAutopilotLogStore,
  type AutopilotCycleLog,
  type AutopilotEmailDelivery,
} from "./autopilot-log";

const RETRY_AFTER_MS = [2, 10, 30, 120, 360].map((minutes) => minutes * 60_000);
const LEGACY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const inflight = new Set<string>();

export function emailDeliveryFromResult(
  runId: string,
  result: { sent: boolean; skipped?: string; error?: string; messageId?: string },
  previous?: AutopilotEmailDelivery,
): AutopilotEmailDelivery {
  const lastAttemptAt = new Date().toISOString();
  if (result.skipped) {
    return {
      status: "skipped",
      runId,
      attempts: previous?.attempts ?? 0,
      lastAttemptAt,
      error: result.skipped,
      queued: false,
    };
  }
  const attempts = (previous?.attempts ?? 0) + 1;
  if (result.sent) {
    return {
      status: "sent",
      runId,
      attempts,
      lastAttemptAt,
      messageId: result.messageId,
      queued: false,
    };
  }
  const delay = RETRY_AFTER_MS[attempts - 1];
  return {
    status: "failed",
    runId,
    attempts,
    lastAttemptAt,
    error: result.error || "Email send failed",
    queued: delay != null,
    nextRetryAt: delay != null ? new Date(Date.now() + delay).toISOString() : undefined,
  };
}

export function recordEmailDelivery(
  cycle: AutopilotCycleLog,
  delivery: AutopilotEmailDelivery,
): void {
  cycle.email = delivery;
  cycle.errors = cycle.errors.filter((entry) => !entry.startsWith("Email failed:"));
  if (delivery.status === "failed" && delivery.error) {
    cycle.errors.push(`Email failed: ${delivery.error}`.slice(0, 500));
  }
}

function legacyUnsent(cycle: AutopilotCycleLog, now: number): boolean {
  if (cycle.email) return false;
  if (cycle.status !== "completed") return false;
  if (!cycle.runsCreated.some((run) => run.runId)) return false;
  const started = Date.parse(cycle.startedAt);
  return Number.isFinite(started) && now - started >= 0 && now - started < LEGACY_LOOKBACK_MS;
}

function retryDue(cycle: AutopilotCycleLog, now: number, force: boolean): boolean {
  const email = cycle.email;
  if (!email) return legacyUnsent(cycle, now);
  if (!email.queued || email.status !== "failed") return false;
  if (!force && email.nextRetryAt && Date.parse(email.nextRetryAt) > now) return false;
  return true;
}

/** Send or resend the draft email for one cycle and store the result on that cycle. */
export async function retryCycleEmail(cycleId: string): Promise<AutopilotCycleLog> {
  if (inflight.has(cycleId)) {
    throw new Error("Email retry already running for this cycle");
  }
  inflight.add(cycleId);
  try {
    const store = getAutopilotLogStore();
    const cycle = await store.get(cycleId);
    if (!cycle) throw new Error("Cycle not found");
    if (cycle.email?.status === "sent") return cycle;

    const runId = cycle.email?.runId || cycle.runsCreated.find((run) => run.runId)?.runId;
    if (!runId) {
      recordEmailDelivery(
        cycle,
        emailDeliveryFromResult("", { sent: false, error: "This cycle has no draft to email" }),
      );
      cycle.email = { ...cycle.email!, queued: false };
      await store.update(cycle);
      return cycle;
    }

    let mail: { sent: boolean; skipped?: string; error?: string; messageId?: string };
    try {
      const run = (await getRunStore().require(runId)) as PipelineRun;
      mail = await notifyAutopilotDraftEmail(run);
    } catch (error) {
      mail = {
        sent: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    recordEmailDelivery(cycle, emailDeliveryFromResult(runId, mail, cycle.email));
    await store.update(cycle);
    logger.info("Autopilot email retry finished", {
      cycleId,
      runId,
      status: cycle.email?.status,
      queued: cycle.email?.queued,
      error: cycle.email?.status === "failed" ? cycle.email.error : undefined,
    });
    return cycle;
  } finally {
    inflight.delete(cycleId);
  }
}

/** Retry queued failures, including recent cycles that never recorded an email. */
export async function retryQueuedAutopilotEmails(options?: { force?: boolean }): Promise<number> {
  const store = getAutopilotLogStore();
  const cycles = await store.list(50);
  const now = Date.now();
  let retried = 0;
  for (const cycle of cycles) {
    if (!retryDue(cycle, now, options?.force === true)) continue;
    try {
      await retryCycleEmail(cycle.id);
      retried += 1;
    } catch (error) {
      logger.warn("Autopilot email queue retry failed", {
        cycleId: cycle.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return retried;
}
