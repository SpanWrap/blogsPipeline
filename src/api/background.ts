import { after } from "next/server";
import { logger } from "../services/logger";

/**
 * Schedule work to continue after the HTTP response is sent.
 * On Vercel/Fluid Compute this keeps the isolate alive via waitUntil so
 * browser refresh/close does not cancel the pipeline.
 */
export function runAfterResponse(label: string, task: () => Promise<void>): void {
  const wrapped = async () => {
    try {
      await task();
    } catch (error) {
      logger.error("Background pipeline task failed", {
        label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  try {
    after(wrapped);
  } catch {
    // Outside a Next.js request scope (e.g. some tests) — still attempt the work.
    void wrapped();
  }
}

export const BACKGROUND_RUN_ACTIONS = new Set([
  "run",
  "research",
  "outline",
  "generate",
  "quality-check",
  "publish",
  "generate-images",
  "readability-pass",
  "regenerate-section",
  "regenerate-selection",
  "accept-stream-draft",
  "refresh",
  "distribute",
]);
