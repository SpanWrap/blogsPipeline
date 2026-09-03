import { describe, expect, it } from "vitest";
import {
  compactAnalysis,
  compactJson,
  compactSourcesForAnalysis,
  compactTemplateForPrompt,
  estimateTokens,
  truncateForPrompt,
} from "@/utils/prompt-budget";
import type { ResearchAnalysis, ResearchSource } from "@/models";

describe("prompt-budget", () => {
  it("truncates long text and estimates tokens", () => {
    const text = "word ".repeat(200);
    const truncated = truncateForPrompt(text, 40);
    expect(truncated.length).toBeLessThanOrEqual(40);
    expect(estimateTokens(truncated)).toBeLessThan(estimateTokens(text));
  });

  it("compacts sources without pretty-print whitespace", () => {
    const sources: ResearchSource[] = [
      {
        id: "s1",
        url: "https://example.com/a",
        title: "A",
        sourceName: "example",
        content: "x".repeat(5000),
        publishedAt: null,
        relevanceScore: 0.9,
      },
      {
        id: "s2",
        url: "https://example.com/b",
        title: "B",
        sourceName: "example",
        content: "y".repeat(5000),
        publishedAt: null,
        relevanceScore: 0.2,
      },
    ];
    const compact = compactSourcesForAnalysis(sources);
    const json = compactJson(compact);
    expect(json.includes("\n")).toBe(false);
    expect(String(compact[0]?.text).length).toBeLessThanOrEqual(2200);
  });

  it("limits analysis claims and template size", () => {
    const analysis: ResearchAnalysis = {
      summary: "summary",
      claims: Array.from({ length: 40 }, (_, i) => ({
        claim: `claim ${i} ${"detail ".repeat(30)}`,
        sourceIds: ["s1"],
        confidence: 0.5,
        category: "fact" as const,
      })),
      keyArguments: ["a"],
      competingViewpoints: [],
      terminology: [],
      sourceRelationships: [],
    };
    const compact = compactAnalysis(analysis);
    expect((compact.claims as unknown[]).length).toBeLessThanOrEqual(22);

    const template = `# Intro\n\n${"instruction paragraph ".repeat(200)}\n\n## Body\n\n${"more ".repeat(400)}`;
    const compactTpl = compactTemplateForPrompt(template);
    expect(compactTpl.length).toBeLessThan(template.length);
    expect(compactTpl).toContain("## Body");
  });
});
