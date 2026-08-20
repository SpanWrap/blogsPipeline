import { describe, expect, it } from "vitest";
import { markdownDraftToArticle } from "@/pipeline/stages/stream-draft";

describe("markdownDraftToArticle", () => {
  it("parses title and excerpt from streamed markdown", () => {
    const article = markdownDraftToArticle(
      [
        "# Shipping AI agents safely",
        "",
        "Founders need clear escalation paths before automation scales.",
        "",
        "## Next steps",
        "",
        "Pilot one intent family first.",
      ].join("\n"),
      {
        topic: "AI agents",
        targetAudience: "founders",
        tone: "clear",
        contentType: "educational",
        keywords: ["AI agents"],
        referenceUrls: [],
      },
      [
        {
          id: "s1",
          url: "https://example.com/a",
          title: "Example",
          sourceName: "example.com",
          content: "body",
          publishedAt: null,
          relevanceScore: 0.9,
        },
      ],
    );
    expect(article.title).toBe("Shipping AI agents safely");
    expect(article.slug).toContain("shipping");
    expect(article.content).toContain("## Next steps");
    expect(article.excerpt.length).toBeGreaterThan(20);
  });
});
