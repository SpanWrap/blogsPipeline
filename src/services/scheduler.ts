import { appConfig } from "../config";
import { logger } from "./logger";
import { runAutopilotCycle, type AutopilotCycleOptions } from "./autopilot";
import { getAutopilotLogStore, type AutopilotCycleLog } from "./autopilot-log";

// ── Lightweight cron expression parser ──

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

function parseRange(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2]!, 10) : 1;
    const range = stepMatch ? stepMatch[1]! : part;

    if (range === "*") {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (range.includes("-")) {
      const [startStr, endStr] = range.split("-");
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      for (let i = start; i <= end; i += step) values.add(i);
    } else {
      const val = parseInt(range, 10);
      if (!isNaN(val) && val >= min && val <= max) values.add(val);
    }
  }
  return values;
}

export function parseCronExpression(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression "${expression}" — expected 5 fields`);
  }
  return {
    minutes: parseRange(parts[0]!, 0, 59),
    hours: parseRange(parts[1]!, 0, 23),
    daysOfMonth: parseRange(parts[2]!, 1, 31),
    months: parseRange(parts[3]!, 1, 12),
    daysOfWeek: parseRange(parts[4]!, 0, 6), // 0 = Sunday
  };
}

function matchesCron(date: Date, fields: CronFields): boolean {
  return (
    fields.minutes.has(date.getUTCMinutes()) &&
    fields.hours.has(date.getUTCHours()) &&
    fields.daysOfMonth.has(date.getUTCDate()) &&
    fields.months.has(date.getUTCMonth() + 1) &&
    fields.daysOfWeek.has(date.getUTCDay())
  );
}

/** Compute the next matching UTC minute after `after`. */
export function nextCronTime(after: Date, fields: CronFields): Date {
  // Start from the next minute
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Scan up to 400 days ahead (should always find a match for valid expressions)
  const maxIterations = 400 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(candidate, fields)) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  // Shouldn't happen with valid cron, but fallback to 7 days
  const fallback = new Date(after.getTime() + 7 * 86_400_000);
  logger.warn("Autopilot scheduler: could not compute next cron time, defaulting to +7d");
  return fallback;
}

// ── Scheduler ──

export type AutopilotSchedulerStatus = {
  enabled: boolean;
  running: boolean;
  cycleBusy: boolean;
  cronExpression: string;
  nextRun: string | null;
  lastCycle: AutopilotCycleLog | null;
  config: {
    platforms: string[];
    postsPerPlatform: number;
    skipReview: boolean;
    dryRun: boolean;
    generateImages: boolean;
    minQualityScore: number;
    deduplicationDays: number;
  };
};

export class AutopilotScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cronFields: CronFields | null = null;
  private nextRunTime: Date | null = null;
  private cycleBusy = false;
  private _enabled = false;

  get enabled(): boolean {
    return this._enabled;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /**
   * Start the scheduler. Parses the cron expression and sets the first timer.
   */
  start(): void {
    if (this.timer) return; // already running

    const cronExpr = appConfig.autopilot.cronExpression;
    try {
      this.cronFields = parseCronExpression(cronExpr);
    } catch (error) {
      logger.error("Autopilot scheduler: invalid cron expression", {
        expression: cronExpr,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    this._enabled = true;
    this.scheduleNext();

    logger.info("Autopilot scheduler started", {
      cron: cronExpr,
      nextRun: this.nextRunTime?.toISOString(),
    });
  }

  /** Stop the scheduler. */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this._enabled = false;
    this.nextRunTime = null;
    logger.info("Autopilot scheduler stopped");
  }

  /** Manually trigger an autopilot cycle right now. */
  async triggerNow(options: AutopilotCycleOptions = {}): Promise<AutopilotCycleLog> {
    if (this.cycleBusy) {
      throw new Error("An autopilot cycle is already running");
    }
    return this.executeCycle(options);
  }

  /** Get current scheduler status. */
  async status(): Promise<AutopilotSchedulerStatus> {
    const logStore = getAutopilotLogStore();
    const lastCycle = await logStore.latest();
    const cfg = appConfig.autopilot;
    const onVercel = Boolean(process.env.VERCEL);
    const enabled = this._enabled || (onVercel && cfg.enabled);

    let nextRun = this.nextRunTime?.toISOString() ?? null;
    if (!nextRun && enabled) {
      try {
        const fields = this.cronFields ?? parseCronExpression(cfg.cronExpression);
        nextRun = nextCronTime(new Date(), fields).toISOString();
      } catch {
        nextRun = null;
      }
    }

    return {
      enabled,
      running: this.running || (onVercel && cfg.enabled),
      cycleBusy: this.cycleBusy,
      cronExpression: cfg.cronExpression,
      nextRun,
      lastCycle,
      config: {
        platforms: cfg.targetPlatforms,
        postsPerPlatform: cfg.postsPerPlatform,
        skipReview: cfg.skipReview,
        dryRun: cfg.dryRun,
        generateImages: cfg.generateImages,
        minQualityScore: cfg.minQualityScore,
        deduplicationDays: cfg.topicDeduplicationDays,
      },
    };
  }

  private scheduleNext(): void {
    if (!this.cronFields || !this._enabled) return;

    this.nextRunTime = nextCronTime(new Date(), this.cronFields);
    const delay = Math.max(1000, this.nextRunTime.getTime() - Date.now());

    // Cap setTimeout to ~24 hours to avoid Node.js timer drift issues,
    // then re-schedule to cover longer gaps.
    const maxDelay = 24 * 60 * 60 * 1000;
    const actualDelay = Math.min(delay, maxDelay);

    this.timer = setTimeout(async () => {
      this.timer = null;

      if (delay > maxDelay) {
        // We haven't reached the actual target time; re-schedule
        this.scheduleNext();
        return;
      }

      // Time to run!
      try {
        await this.executeCycle();
      } catch (error) {
        logger.error("Autopilot scheduler: cycle execution failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Schedule next cycle
      if (this._enabled) {
        this.scheduleNext();
      }
    }, actualDelay);

    // Prevent the timer from keeping the process alive on shutdown
    if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  private async executeCycle(options: AutopilotCycleOptions = {}): Promise<AutopilotCycleLog> {
    this.cycleBusy = true;
    try {
      const result = await runAutopilotCycle(options);
      return result;
    } finally {
      this.cycleBusy = false;
    }
  }
}

// ── Singleton ──

let defaultScheduler: AutopilotScheduler | null = null;

export function getAutopilotScheduler(): AutopilotScheduler {
  if (!defaultScheduler) defaultScheduler = new AutopilotScheduler();
  return defaultScheduler;
}

/**
 * Auto-start the scheduler if AUTOPILOT_ENABLED=true.
 * Called from server boot.
 */
export function maybeStartAutopilotScheduler(): void {
  // Serverless instances do not keep setTimeout alive. Vercel Cron hits GET /api/cron/autopilot.
  if (process.env.VERCEL) return;
  if (appConfig.autopilot.enabled) {
    const scheduler = getAutopilotScheduler();
    if (!scheduler.running) {
      scheduler.start();
    }
  }
}
