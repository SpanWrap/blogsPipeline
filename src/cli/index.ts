#!/usr/bin/env node
import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { ContentBriefSchema, type ContentBrief } from "../models/index.js";
import { createOrchestrator } from "../pipeline/index.js";
import { logger } from "../services/logger.js";

const program = new Command();
const orch = () => createOrchestrator();

function printRun(run: {
  id: string;
  status: string;
  error?: string | null;
  sources?: unknown[];
  outline?: unknown;
  article?: { title?: string; slug?: string } | null;
  quality?: { passed?: boolean; score?: number; issues?: unknown[] } | null;
  publishResult?: { success?: boolean; message?: string; externalId?: string } | null;
}) {
  console.log(`id:      ${run.id}`);
  console.log(`status:  ${run.status}`);
  if (run.error) console.log(`error:   ${run.error}`);
  if (run.sources) console.log(`sources: ${run.sources.length}`);
  if (run.outline) console.log("outline: ready");
  if (run.article) console.log(`article: ${run.article.title} (${run.article.slug})`);
  if (run.quality) {
    console.log(`quality: score=${run.quality.score} passed=${run.quality.passed}`);
    if (run.quality.issues?.length) {
      console.log(`issues:  ${run.quality.issues.length}`);
    }
  }
  if (run.publishResult) {
    console.log(
      `publish: success=${run.publishResult.success} ${run.publishResult.message ?? ""} ${run.publishResult.externalId ?? ""}`.trim(),
    );
  }
}

program
  .name("blog-pipeline")
  .description("Standalone Spanwrap Blog Content Pipeline CLI")
  .version("0.1.0");

program
  .command("create")
  .description("Create a pipeline run from a topic or brief JSON file")
  .option("-t, --topic <topic>", "Blog topic")
  .option("-f, --file <path>", "Path to content brief JSON")
  .option("--audience <audience>", "Target audience", "general readers")
  .option("--tone <tone>", "Tone", "clear and professional")
  .option("--keywords <list>", "Comma-separated keywords")
  .option("--template <id>", "Article template id")
  .action(async (opts: {
    topic?: string;
    file?: string;
    audience: string;
    tone: string;
    keywords?: string;
    template?: string;
  }) => {
    try {
      let brief: ContentBrief;
      if (opts.file) {
        const raw = JSON.parse(await readFile(opts.file, "utf8"));
        brief = ContentBriefSchema.parse(raw);
      } else if (opts.topic) {
        brief = ContentBriefSchema.parse({
          topic: opts.topic,
          targetAudience: opts.audience,
          tone: opts.tone,
          contentType: "educational",
          keywords: opts.keywords
            ? opts.keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
            : [],
          referenceUrls: [],
        });
      } else {
        console.error("Provide --topic or --file");
        process.exitCode = 1;
        return;
      }
      const run = await orch().create(brief, { templateId: opts.template ?? null });
      console.log("Created pipeline run");
      printRun(run);
      if (run.templateName) console.log(`template: ${run.templateName}`);
    } catch (error) {
      logger.error("create failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
  });

program
  .command("list")
  .description("List pipeline runs")
  .action(async () => {
    const runs = await orch().list();
    if (runs.length === 0) {
      console.log("No runs found.");
      return;
    }
    for (const run of runs) {
      console.log(`${run.id}\t${run.status}\t${run.brief.topic}`);
    }
  });

program
  .command("show <id>")
  .description("Show a pipeline run summary or full JSON")
  .option("--json", "Print full JSON")
  .action(async (id: string, opts: { json?: boolean }) => {
    try {
      const run = await orch().get(id);
      if (opts.json) {
        console.log(JSON.stringify(run, null, 2));
      } else {
        printRun(run);
        console.log(`topic:   ${run.brief.topic}`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

for (const [name, method] of [
  ["research", "research"],
  ["outline", "outline"],
  ["generate", "generate"],
  ["quality-check", "qualityCheck"],
  ["publish", "publish"],
] as const) {
  program
    .command(`${name} <id>`)
    .description(`Run the ${name} stage`)
    .action(async (id: string) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const run = await (orch() as any)[method](id);
        printRun(run);
        if (run.status === "FAILED" || run.status === "PUBLISH_FAILED") {
          process.exitCode = 1;
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}

program
  .command("approve <id>")
  .description("Approve article for publishing")
  .option("-n, --notes <notes>", "Review notes")
  .action(async (id: string, opts: { notes?: string }) => {
    try {
      const run = await orch().approve(id, opts.notes);
      printRun(run);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program
  .command("reject <id>")
  .description("Reject article (remain in review)")
  .option("-n, --notes <notes>", "Review notes")
  .action(async (id: string, opts: { notes?: string }) => {
    try {
      const run = await orch().reject(id, opts.notes);
      printRun(run);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program
  .command("run <id>")
  .description("Run research → outline → generate → quality (until human review)")
  .action(async (id: string) => {
    try {
      const run = await orch().runUntilReview(id);
      printRun(run);
      if (run.status === "FAILED") process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program
  .command("set-outline <id> <file>")
  .description("Replace outline from a JSON file")
  .action(async (id: string, file: string) => {
    try {
      const outline = JSON.parse(await readFile(file, "utf8"));
      const run = await orch().updateOutline(id, outline);
      printRun(run);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program
  .command("set-article <id> <file>")
  .description("Replace article from a JSON file")
  .action(async (id: string, file: string) => {
    try {
      const article = JSON.parse(await readFile(file, "utf8"));
      const run = await orch().updateArticle(id, article);
      printRun(run);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

const templates = program.command("templates").description("Manage Markdown article templates");

templates
  .command("list")
  .description("List uploaded templates")
  .action(async () => {
    const { getTemplateStore } = await import("../services/templates.js");
    const list = await getTemplateStore().list();
    if (!list.length) {
      console.log("No templates.");
      return;
    }
    for (const t of list) {
      console.log(`${t.id}\t${t.name}\t${t.filename || "-"}`);
    }
  });

templates
  .command("upload <file>")
  .description("Upload a .md template file")
  .option("-n, --name <name>", "Template name")
  .action(async (file: string, opts: { name?: string }) => {
    try {
      const { uploadTemplate } = await import("../services/templates.js");
      const markdown = await readFile(file, "utf8");
      const base = file.split(/[\\/]/).pop() ?? file;
      const t = await uploadTemplate({
        name: opts.name ?? base.replace(/\.md$/i, ""),
        markdown,
        filename: base,
      });
      console.log(`Saved template ${t.id} (${t.name})`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

templates
  .command("show <id>")
  .description("Print template markdown")
  .action(async (id: string) => {
    try {
      const { getTemplateStore } = await import("../services/templates.js");
      const t = await getTemplateStore().require(id);
      console.log(`# ${t.name} (${t.id})\n`);
      console.log(t.markdown);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

templates
  .command("delete <id>")
  .description("Delete a template")
  .action(async (id: string) => {
    try {
      const { getTemplateStore } = await import("../services/templates.js");
      const ok = await getTemplateStore().delete(id);
      console.log(ok ? "Deleted." : "Not found.");
      if (!ok) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program
  .command("set-template <id> <templateId>")
  .description("Assign a template to a run (use 'none' to clear)")
  .action(async (id: string, templateId: string) => {
    try {
      const run = await orch().assignTemplate(
        id,
        templateId === "none" || templateId === "-" ? null : templateId,
      );
      printRun(run);
      if (run.templateName) console.log(`template: ${run.templateName}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

// ── Autopilot CLI ──

const autopilot = program.command("autopilot").description("Manage the weekly autopilot scheduler");

autopilot
  .command("run")
  .description("Trigger one autopilot cycle immediately (discover → generate → publish)")
  .option("--dry-run", "Generate drafts but skip publishing")
  .option("--offline", "Use mock providers (testing)")
  .option("--platforms <list>", "Comma-separated platforms to target")
  .option("--posts <n>", "Posts per platform", "2")
  .action(async (opts: { dryRun?: boolean; offline?: boolean; platforms?: string; posts?: string }) => {
    try {
      const { runAutopilotCycle } = await import("../services/autopilot.js");
      const cycle = await runAutopilotCycle({
        dryRun: opts.dryRun,
        offline: opts.offline,
        platforms: opts.platforms
          ? (opts.platforms.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean) as any)
          : undefined,
        postsPerPlatform: opts.posts ? parseInt(opts.posts, 10) : undefined,
      });
      console.log(`\nAutopilot cycle: ${cycle.id}`);
      console.log(`Status:    ${cycle.status}`);
      console.log(`Topics:    ${cycle.topicsSelected} selected (${cycle.topicsDiscovered} discovered)`);
      console.log(`Runs:      ${cycle.runsCreated.length} created`);
      console.log(`Published: ${cycle.runsPublished}`);
      console.log(`Review:    ${cycle.runsNeedingReview}`);
      if (cycle.errors.length > 0) {
        console.log(`Errors:    ${cycle.errors.length}`);
        for (const err of cycle.errors) console.log(`  - ${err}`);
      }
      console.log();
      for (const run of cycle.runsCreated) {
        console.log(`  ${run.runId}\t${run.platform}\t${run.status}\t${run.topic}`);
      }
    } catch (error) {
      logger.error("autopilot run failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
  });

autopilot
  .command("status")
  .description("Show autopilot scheduler status and configuration")
  .action(async () => {
    try {
      const { getAutopilotScheduler } = await import("../services/scheduler.js");
      const scheduler = getAutopilotScheduler();
      const status = await scheduler.status();
      console.log(`Enabled:       ${status.enabled}`);
      console.log(`Running:       ${status.running}`);
      console.log(`Cycle busy:    ${status.cycleBusy}`);
      console.log(`Cron:          ${status.cronExpression}`);
      console.log(`Next run:      ${status.nextRun ?? "—"}`);
      console.log(`Platforms:     ${status.config.platforms.join(", ")}`);
      console.log(`Posts/platform:${status.config.postsPerPlatform}`);
      console.log(`Skip review:   ${status.config.skipReview}`);
      console.log(`Dry run:       ${status.config.dryRun}`);
      console.log(`Min quality:   ${status.config.minQualityScore}`);
      console.log(`Dedup days:    ${status.config.deduplicationDays}`);
      if (status.lastCycle) {
        console.log(`\nLast cycle:    ${status.lastCycle.id} (${status.lastCycle.status})`);
        console.log(`  Started:     ${status.lastCycle.startedAt}`);
        console.log(`  Completed:   ${status.lastCycle.completedAt ?? "—"}`);
        console.log(`  Published:   ${status.lastCycle.runsPublished}`);
        console.log(`  Review:      ${status.lastCycle.runsNeedingReview}`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

autopilot
  .command("history")
  .description("List past autopilot cycle logs")
  .option("-n, --limit <n>", "Number of cycles to show", "10")
  .action(async (opts: { limit?: string }) => {
    try {
      const { getAutopilotLogStore } = await import("../services/autopilot-log.js");
      const store = getAutopilotLogStore();
      const limit = opts.limit ? parseInt(opts.limit, 10) : 10;
      const cycles = await store.list(limit);
      if (cycles.length === 0) {
        console.log("No autopilot cycles recorded yet.");
        return;
      }
      for (const c of cycles) {
        const runs = c.runsCreated.length;
        const published = c.runsPublished;
        const errors = c.errors.length;
        console.log(
          `${c.id}\t${c.status}\t${c.startedAt}\truns=${runs}\tpublished=${published}\terrors=${errors}`,
        );
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

autopilot
  .command("enable")
  .description("Enable the autopilot scheduler")
  .action(async () => {
    const { getAutopilotScheduler } = await import("../services/scheduler.js");
    const scheduler = getAutopilotScheduler();
    scheduler.start();
    console.log("Autopilot scheduler enabled.");
    const status = await scheduler.status();
    console.log(`Next run: ${status.nextRun ?? "—"}`);
  });

autopilot
  .command("disable")
  .description("Disable the autopilot scheduler")
  .action(async () => {
    const { getAutopilotScheduler } = await import("../services/scheduler.js");
    const scheduler = getAutopilotScheduler();
    scheduler.stop();
    console.log("Autopilot scheduler disabled.");
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
