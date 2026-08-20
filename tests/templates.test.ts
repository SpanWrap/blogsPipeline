import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BlogPipelineOrchestrator } from "@/pipeline/orchestrator";
import { MockLLMProvider } from "@/providers/llm";
import { MockResearchProvider } from "@/providers/research";
import { MockPublisher, resetMockPublisherState } from "@/providers/publishing";
import { FileRunStore } from "@/services/storage";
import { FileTemplateStore, uploadTemplate } from "@/services/templates";
import {
  applyMarkdownTemplate,
  describeTemplateForPrompt,
  listPlaceholders,
  templateHasPlaceholders,
} from "@/utils/template";

describe("template helpers", () => {
  it("detects and fills placeholders", () => {
    const tpl = "# {{title}}\n\n{{body}}\n\n## Sources\n{{sources}}";
    expect(templateHasPlaceholders(tpl)).toBe(true);
    expect(listPlaceholders(tpl).sort()).toEqual(["body", "sources", "title"]);
    const filled = applyMarkdownTemplate(tpl, {
      title: "Hello",
      body: "Body text here with enough detail for a researched article.",
      sources: [{ title: "A", url: "https://example.com/a" }],
    });
    expect(filled).toContain("# Hello");
    expect(filled).toContain("Body text");
    expect(filled).toContain("https://example.com/a");
  });

  it("returns body when template has no placeholders", () => {
    const out = applyMarkdownTemplate("## Fixed structure\n\nText", {
      title: "T",
      body: "# Generated\n\nContent",
    });
    expect(out).toBe("# Generated\n\nContent");
  });

  it("describes templates as section guidelines for the LLM", () => {
    const guidance = describeTemplateForPrompt("## Hook\nWrite a sharp opening.\n\n## Body\n{{body}}");
    expect(guidance).toMatch(/TEMPLATE/);
    expect(guidance).toContain("## Hook");
    expect(guidance).toContain("{{body}}");
  });
});

describe("template store + generation", () => {
  it("stores uploaded md and shapes generated article", async () => {
    resetMockPublisherState();
    const dataDir = mkdtempSync(path.join(tmpdir(), "tpl-"));
    mkdirSync(path.join(dataDir, "runs"), { recursive: true });
    mkdirSync(path.join(dataDir, "templates"), { recursive: true });
    const templateStore = new FileTemplateStore(dataDir);
    const store = new FileRunStore(dataDir);
    const tpl = await uploadTemplate(
      {
        name: "Intern v1",
        filename: "intern.md",
        markdown: [
          "# {{title}}",
          "",
          "> {{excerpt}}",
          "",
          "## Opening",
          "",
          "{{body}}",
          "",
          "## Sources",
          "",
          "{{sources}}",
        ].join("\n"),
      },
      templateStore,
    );

    const orch = new BlogPipelineOrchestrator({
      store,
      templateStore,
      llm: new MockLLMProvider(),
      publisher: new MockPublisher("success"),
      researchProvider: new MockResearchProvider(),
      offlineExtract: true,
    });

    const created = await orch.create(
      {
        topic: "AI agents in customer support",
        targetAudience: "startup founders",
        tone: "clear",
        contentType: "educational",
        keywords: ["AI agents"],
        referenceUrls: [],
      },
      { templateId: tpl.id },
    );
    expect(created.templateId).toBe(tpl.id);
    expect(created.templateMarkdown).toContain("{{body}}");

    const reviewed = await orch.runUntilReview(created.id);
    expect(reviewed.article?.content).toContain("# ");
    expect(reviewed.article?.content).toContain("## Opening");
    expect(reviewed.article?.content).toContain("## Sources");
    rmSync(dataDir, { recursive: true, force: true });
  });
});
