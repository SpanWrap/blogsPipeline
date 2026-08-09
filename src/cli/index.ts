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
  .action(async (opts: {
    topic?: string;
    file?: string;
    audience: string;
    tone: string;
    keywords?: string;
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
      const run = await orch().create(brief);
      console.log("Created pipeline run");
      printRun(run);
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

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
