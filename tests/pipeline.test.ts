import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileRunStore } from "@/services/storage";
import { MockLLMProvider } from "@/providers/llm";
import { MockResearchProvider } from "@/providers/research";
import { MockPublisher, resetMockPublisherState } from "@/providers/publishing";
import { BlogPipelineOrchestrator } from "@/pipeline/orchestrator";
import { extractFromHtml } from "@/services/extraction";
import { qualityStage } from "@/pipeline/stages/quality";
import { researchStage } from "@/pipeline/stages/research";
import { analysisStage } from "@/pipeline/stages/analysis";
import { outlineStage } from "@/pipeline/stages/outline";
import { generationStage } from "@/pipeline/stages/generation";
import {
  BlogOutlineSchema,
  GeneratedBlogSchema,
  ResearchAnalysisSchema,
  parsePublishTargets,
  type GeneratedBlog,
} from "@/models";
import { createIdempotencyKey } from "@/utils/idempotency";
import { normalizeUrl, isValidHttpUrl } from "@/utils/url";
import { withRetry } from "@/utils/retry";

function sampleArticle(overrides: Partial<GeneratedBlog> = {}): GeneratedBlog {
  const base = {
    title: "AI agents in customer support",
    subtitle: "A practical guide",
    slug: "ai-agents-in-customer-support",
    excerpt: "How founders can ship support agents responsibly.",
    content: [
      "# AI agents in customer support",
      "",
      "Customer support teams need faster answers without losing trust. AI agents can help when scope and escalation are explicit.",
      "",
      "## Why this matters now",
      "",
      "Support load grows with product complexity. Automation is useful when high-volume, low-risk intents are identified first.",
      "",
      "## What the research shows",
      "",
      "Grounded implementations start narrow and measure quality continuously.",
      "",
      "## How to apply it",
      "",
      "Pick one intent, instrument outcomes, and keep humans available for sensitive work.",
      "",
      "## Conclusion",
      "",
      "Treat agent systems like production software: scope carefully and measure often.",
    ].join("\n"),
    tags: ["ai"],
    keywords: ["AI agents", "customer support"],
    seoTitle: "AI agents in customer support",
    seoDescription: "Practical guidance for startup founders.",
    sources: [
      {
        title: "Foundations",
        url: "https://example.com/ai-agents-support-foundations",
        sourceName: "example.com",
      },
    ],
    sourceMap: [],
    ...overrides,
  };
  // Allow invalid fixtures for quality-check input paths
  return base as GeneratedBlog;
}

describe("utils", () => {
  it("normalizes and validates urls", () => {
    expect(isValidHttpUrl("https://example.com/a")).toBe(true);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(normalizeUrl("https://example.com/a/?utm_source=x#frag")).toBe(
      "https://example.com/a",
    );
  });

  it("parses publishing destinations", () => {
    expect(parsePublishTargets(["medium", "spanwrap", "medium"])).toEqual([
      "medium",
      "spanwrap",
    ]);
    expect(() => parsePublishTargets([])).toThrow(/at least one/);
  });

  it("resolves featured images from markdown and GitHub URLs", async () => {
    const { extractMarkdownImageUrls, githubOpenGraphImage, resolveFeaturedImage } = await import(
      "@/utils/images"
    );
    expect(extractMarkdownImageUrls("See ![hero](https://cdn.example.com/a.png)")).toEqual([
      "https://cdn.example.com/a.png",
    ]);
    expect(githubOpenGraphImage("https://github.com/owner/repo")).toBe(
      "https://opengraph.githubassets.com/1/owner/repo",
    );
    expect(
      resolveFeaturedImage({
        content: "no images",
        sourceUrls: ["https://github.com/owner/repo"],
      }),
    ).toBe("https://opengraph.githubassets.com/1/owner/repo");
  });

  it("retries transient failures", async () => {
    let n = 0;
    const value = await withRetry(
      async () => {
        n += 1;
        if (n < 3) {
          const err = new Error("temp") as Error & { status: number };
          err.status = 429;
          throw err;
        }
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(value).toBe("ok");
    expect(n).toBe(3);
  });

  it("builds stable idempotency keys", () => {
    expect(createIdempotencyKey(["a", "b"])).toBe(createIdempotencyKey(["a", "b"]));
  });
});

describe("extraction", () => {
  it("extracts main content and drops chrome", () => {
    const html = `
      <html><head><title>Hello Research</title></head>
      <body>
        <nav>Home About</nav>
        <article>
          <h1>Hello Research</h1>
          <p>This is the main article body with enough text to pass extraction heuristics for testing purposes.</p>
          <p>Second paragraph with more useful content about the topic.</p>
        </article>
        <footer>Copyright</footer>
      </body></html>`;
    const page = extractFromHtml(html, "https://example.com/article");
    expect(page.title).toContain("Hello Research");
    expect(page.content).toContain("main article body");
    expect(page.content.toLowerCase()).not.toContain("copyright");
  });

  it("handles empty pages by returning thin content", () => {
    const page = extractFromHtml("<html><body></body></html>", "https://example.com/empty");
    expect(page.content.length).toBeLessThan(40);
  });
});

describe("research", () => {
  it("discovers sources and removes duplicates", async () => {
    const { sources, providerName } = await researchStage(
      {
        topic: "AI agents in customer support",
        targetAudience: "startup founders",
        tone: "technical but easy to understand",
        contentType: "educational",
        keywords: ["AI agents", "customer support"],
        referenceUrls: ["https://example.com/ai-agents-support-foundations"],
      },
      { researchProvider: new MockResearchProvider(), offlineExtract: true },
    );
    expect(providerName).toBe("mock-research");
    expect(sources.length).toBeGreaterThan(0);
    const urls = sources.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("analysis / outline / generation", () => {
  const llm = new MockLLMProvider();
  const brief = {
    topic: "AI agents in customer support",
    targetAudience: "startup founders",
    tone: "technical but easy to understand",
    contentType: "educational",
    keywords: ["AI agents"],
    referenceUrls: [],
  };

  it("produces valid analysis with source-backed claims", async () => {
    const { sources } = await researchStage(brief, {
      researchProvider: new MockResearchProvider(),
      offlineExtract: true,
    });
    const analysis = await analysisStage(brief, sources, llm);
    expect(ResearchAnalysisSchema.parse(analysis)).toBeTruthy();
    for (const claim of analysis.claims) {
      expect(claim.sourceIds.length).toBeGreaterThan(0);
      for (const id of claim.sourceIds) {
        expect(sources.some((s) => s.id === id)).toBe(true);
      }
    }
  });

  it("produces a valid outline", async () => {
    const { sources } = await researchStage(brief, {
      researchProvider: new MockResearchProvider(),
      offlineExtract: true,
    });
    const analysis = await analysisStage(brief, sources, llm);
    const outline = await outlineStage(brief, sources, analysis, llm);
    expect(BlogOutlineSchema.parse(outline)).toBeTruthy();
    expect(outline.sections.length).toBeGreaterThan(0);
  });

  it("produces a valid article", async () => {
    const { sources } = await researchStage(brief, {
      researchProvider: new MockResearchProvider(),
      offlineExtract: true,
    });
    const analysis = await analysisStage(brief, sources, llm);
    const outline = await outlineStage(brief, sources, analysis, llm);
    const article = await generationStage(brief, sources, analysis, outline, llm);
    expect(GeneratedBlogSchema.parse(article)).toBeTruthy();
    expect(article.content.length).toBeGreaterThan(100);
  });
});

describe("quality", () => {
  it("flags missing title / invalid metadata", () => {
    const result = qualityStage(
      sampleArticle({ title: "", slug: "BAD SLUG", seoDescription: "" }),
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.type === "missing_title")).toBe(true);
  });

  it("flags missing sources for percentage claims", () => {
    const result = qualityStage(
      sampleArticle({
        content: sampleArticle().content + "\n\nConversion improved by 42% overnight.\n",
        sources: [],
      }),
      [],
    );
    expect(result.issues.some((i) => i.type === "missing_source")).toBe(true);
  });

  it("passes a solid article", () => {
    const article = sampleArticle();
    const sources = [
      {
        id: "source_1",
        url: article.sources[0]!.url,
        title: article.sources[0]!.title,
        sourceName: "example.com",
        content: "content",
        publishedAt: null,
        relevanceScore: 0.9,
      },
    ];
    const result = qualityStage(article, sources);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(60);
  });
});

describe("publishing", () => {
  beforeEach(() => resetMockPublisherState());

  it("attaches a featured image from GitHub sources", async () => {
    const { toPublishableBlog } = await import("@/pipeline/stages/publishing");
    const blog = toPublishableBlog(
      sampleArticle({
        sources: [
          {
            title: "Repo",
            url: "https://github.com/owner/repo",
            sourceName: "github.com",
          },
        ],
      }),
    );
    expect(blog.featuredImage).toBe("https://opengraph.githubassets.com/1/owner/repo");
  });

  it("publishes successfully and is idempotent", async () => {
    const publisher = new MockPublisher("success");
    const blog = {
      title: "T",
      slug: "t",
      excerpt: "e",
      content: "c",
      tags: [],
      keywords: [],
      seoTitle: "T",
      seoDescription: "e",
      featuredImage: null,
      publishedAt: null,
      sources: [],
    };
    const key = "idem-1";
    const first = await publisher.publish(blog, { idempotencyKey: key });
    const second = await publisher.publish(blog, { idempotencyKey: key });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.message).toMatch(/Idempotent/i);
  });

  it("handles auth failure", async () => {
    const result = await new MockPublisher("auth").publish(
      {
        title: "T",
        slug: "t",
        excerpt: "e",
        content: "c",
        tags: [],
        keywords: [],
        seoTitle: "T",
        seoDescription: "e",
        featuredImage: null,
        publishedAt: null,
        sources: [],
      },
      { idempotencyKey: "x" },
    );
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it("handles validation, rate limit, server, timeout", async () => {
    for (const [behavior, code] of [
      ["validation", 400],
      ["rate_limit", 429],
      ["server", 500],
      ["timeout", undefined],
    ] as const) {
      const result = await new MockPublisher(behavior).publish(
        {
          title: "T",
          slug: "t",
          excerpt: "e",
          content: "c",
          tags: [],
          keywords: [],
          seoTitle: "T",
          seoDescription: "e",
          featuredImage: null,
          publishedAt: null,
          sources: [],
        },
        { idempotencyKey: `k-${behavior}` },
      );
      expect(result.success).toBe(false);
      if (code) expect(result.statusCode).toBe(code);
    }
  });
});

describe("end-to-end pipeline", () => {
  let dataDir: string;
  let store: FileRunStore;
  let orch: BlogPipelineOrchestrator;

  beforeEach(() => {
    resetMockPublisherState();
    dataDir = mkdtempSync(path.join(tmpdir(), "blog-pipeline-"));
    mkdirSync(path.join(dataDir, "runs"), { recursive: true });
    store = new FileRunStore(dataDir);
    orch = new BlogPipelineOrchestrator({
      store,
      llm: new MockLLMProvider(),
      publisher: new MockPublisher("success"),
      researchProvider: new MockResearchProvider(),
      offlineExtract: true,
    });
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("brief → research → outline → generate → quality → approve → publish", async () => {
    const created = await orch.create({
      topic: "AI agents in customer support",
      targetAudience: "startup founders",
      tone: "technical but easy to understand",
      contentType: "educational",
      keywords: ["AI agents", "customer support", "automation"],
      referenceUrls: [],
    });
    expect(created.status).toBe("CREATED");

    const researched = await orch.research(created.id);
    expect(researched.status).toBe("RESEARCH_COMPLETE");
    expect(researched.sources.length).toBeGreaterThan(0);
    expect(researched.analysis?.claims.length).toBeGreaterThan(0);

    const outlined = await orch.outline(created.id);
    expect(outlined.status).toBe("OUTLINE_READY");
    expect(outlined.outline?.sections.length).toBeGreaterThan(0);

    const generated = await orch.generate(created.id);
    expect(generated.status).toBe("DRAFT_READY");
    expect(generated.article?.content.length).toBeGreaterThan(50);

    const checked = await orch.qualityCheck(created.id);
    expect(checked.status).toBe("REVIEW_REQUIRED");
    expect(checked.quality).toBeTruthy();

    const approved = await orch.approve(created.id, "Looks good");
    expect(approved.status).toBe("APPROVED");

    const published = await orch.publish(created.id);
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishResult?.success).toBe(true);
    expect(published.publishTargets).toEqual(["spanwrap"]);
    expect(published.publishResults.some((r) => r.target === "spanwrap" && r.success)).toBe(true);

    // Idempotent re-publish should not explode (publisher layer); run still published
    const again = await orch.get(created.id);
    expect(again.status).toBe("PUBLISHED");
  });

  it("saves quality-review destinations and keeps planned sites unpublished", async () => {
    const created = await orch.create({
      topic: "AI agents in customer support",
      targetAudience: "startup founders",
      tone: "clear",
      contentType: "educational",
      keywords: ["AI agents"],
      referenceUrls: [],
    });
    await orch.runUntilReview(created.id);
    const saved = await orch.saveReview(created.id, {
      publishTargets: ["spanwrap", "medium", "substack"],
    });
    expect(saved.publishTargets).toEqual(["spanwrap", "medium", "substack"]);
    expect(saved.status).toBe("REVIEW_REQUIRED");

    await orch.approve(created.id);
    const published = await orch.publish(created.id);
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishResults).toHaveLength(3);
    expect(published.publishResults.find((r) => r.target === "spanwrap")?.success).toBe(true);
    expect(published.publishResults.find((r) => r.target === "medium")?.statusCode).toBe(501);
  });

  it("keeps APPROVED when only planned destinations are selected", async () => {
    const created = await orch.create({
      topic: "AI agents in customer support",
      targetAudience: "startup founders",
      tone: "clear",
      contentType: "educational",
      keywords: ["AI agents"],
      referenceUrls: [],
    });
    await orch.runUntilReview(created.id);
    await orch.saveReview(created.id, { publishTargets: ["medium"] });
    await orch.approve(created.id);
    const result = await orch.publish(created.id);
    expect(result.status).toBe("APPROVED");
    expect(result.publishResults[0]?.target).toBe("medium");
    expect(result.publishResults[0]?.statusCode).toBe(501);
  });

  it("Run to review always regenerates research through quality", async () => {
    const created = await orch.create({
      topic: "AI agents in customer support",
      targetAudience: "startup founders",
      tone: "clear",
      contentType: "educational",
      keywords: ["AI agents"],
      referenceUrls: [],
    });
    await orch.research(created.id);
    await orch.outline(created.id);

    const reviewed = await orch.runUntilReview(created.id);
    expect(reviewed.article?.content.length).toBeGreaterThan(50);
    expect(reviewed.status).toBe("REVIEW_REQUIRED");
    expect(reviewed.quality).toBeTruthy();
  });

  it("serializes concurrent Run to review so generate still receives the outline", async () => {
    const created = await orch.create({
      topic: "AI agents in customer support",
      targetAudience: "startup founders",
      tone: "clear",
      contentType: "educational",
      keywords: ["AI agents"],
      referenceUrls: [],
    });
    const [first, second] = await Promise.all([
      orch.runUntilReview(created.id),
      orch.runUntilReview(created.id),
    ]);
    const final = await orch.get(created.id);
    expect(first.article || second.article).toBeTruthy();
    expect(final.article?.content.length).toBeGreaterThan(50);
    expect(final.status).toBe("REVIEW_REQUIRED");
    expect(final.error).toBeNull();
  });

  it("does not publish without approval", async () => {
    const created = await orch.create({
      topic: "Something",
      targetAudience: "founders",
      tone: "clear",
      contentType: "educational",
      keywords: [],
      referenceUrls: [],
    });
    await orch.runUntilReview(created.id);
    await expect(orch.publish(created.id)).rejects.toThrow(/APPROVED/);
  });
});
