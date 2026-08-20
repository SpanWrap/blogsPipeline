import { describe, expect, it } from "vitest";
import { buildFactCards } from "@/services/fact-cards";
import { buildCompetitorBrief } from "@/services/competitor-brief";
import { readabilityPass } from "@/services/readability-pass";
import { diffArticles } from "@/services/diff-review";
import { buildRepurposePack } from "@/services/repurpose";
import { injectRelevantAffiliateLinks } from "@/services/affiliate-relevance";
import { planCrossPost } from "@/services/canonical-rules";
import { buildResumeDashboard } from "@/services/resume-dashboard";
import { getStylePreset, stripBannedPhrases } from "@/services/style-presets";
import { buildSeoPack } from "@/services/enrichment";
import { listArticleSections } from "@/services/section-regenerate";

describe("quality & productivity feature pack", () => {
  it("builds grounded fact cards", () => {
    const cards = buildFactCards(
      {
        summary: "s",
        claims: [
          { claim: "Agents need escalation", sourceIds: ["s1"], confidence: 0.9, category: "fact" },
          { claim: "Unsourced claim", sourceIds: ["missing"], confidence: 0.2, category: "fact" },
        ],
        keyArguments: [],
        competingViewpoints: ["Humans only"],
        terminology: [],
        sourceRelationships: [],
      },
      [
        {
          id: "s1",
          url: "https://example.com/a",
          title: "A",
          sourceName: "ex",
          content: "c",
          publishedAt: null,
          relevanceScore: 1,
        },
      ],
    );
    expect(cards[0]?.grounded).toBe(true);
    expect(cards[1]?.grounded).toBe(false);
  });

  it("builds competitor brief and style lock", () => {
    const brief = buildCompetitorBrief(
      {
        summary: "summary",
        claims: [],
        keyArguments: ["Own the ops playbook"],
        competingViewpoints: ["Wait and see"],
        terminology: [],
        sourceRelationships: [],
      },
      [],
      "AI agents",
    );
    expect(brief.anglesToOwn[0]).toContain("ops");
    expect(getStylePreset("founder")?.label).toMatch(/Founder/);
    expect(stripBannedPhrases("This is a game-changer for teams", "founder")).not.toMatch(/game-changer/i);
  });

  it("runs readability, diff, seo, repurpose, affiliate relevance, canonical, dashboard, sections", () => {
    const article = {
      title: "AI agents in support",
      subtitle: "",
      slug: "ai-agents-in-support",
      excerpt: "A practical guide for founders shipping support agents responsibly with clear escalation.",
      content:
        "# AI agents in support\n\n## Why now\n\nIt is important to note that support load grows. Due to the fact that teams are small, A large number of tickets pile up and this paragraph is intentionally extremely long so the readability pass has something substantial to split into multiple blocks for scanning by busy founders who need clearer structure without fluff.\n\n## Apply it\n\nUse AWS and Vercel carefully.",
      tags: ["ai"],
      keywords: ["AI agents"],
      seoTitle: "AI agents in support",
      seoDescription: "A practical guide for founders shipping support agents responsibly with clear escalation.",
      sources: [],
      sourceMap: [],
      featuredImage: null,
    };
    const tightened = readabilityPass(article);
    expect(tightened.content).not.toMatch(/It is important to note that/i);
    const hunks = diffArticles(article.content, tightened.content);
    expect(hunks.some((h) => h.type !== "same")).toBe(true);
    const seo = buildSeoPack(article, article.title);
    expect(seo.titles.length).toBeGreaterThan(1);
    const pack = buildRepurposePack({ ...article, content: article.content });
    expect(pack.newsletterBlurb).toContain("Read the full article");
    expect(pack.thread.length).toBeGreaterThan(2);
    const aff = injectRelevantAffiliateLinks(article.content, article.title);
    expect(aff.scored.some((s) => s.name === "AWS" || s.name === "Vercel")).toBe(true);
    const plan = planCrossPost(["spanwrap", "medium"], article.slug);
    expect(plan.primary).toBe("spanwrap");
    expect(plan.canonicalUrl).toContain(article.slug);
    const dash = buildResumeDashboard([
      {
        id: "run_1",
        status: "FAILED",
        retryable: true,
        failedStage: "generation",
      } as never,
      { id: "run_2", status: "REVIEW_REQUIRED", retryable: false } as never,
    ]);
    expect(dash.buckets.some((b) => b.id === "failed_retryable")).toBe(true);
    expect(listArticleSections(article.content)).toEqual(["Why now", "Apply it"]);
  });
});
