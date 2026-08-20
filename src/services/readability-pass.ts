import type { GeneratedBlog } from "../models";

/** Heuristic readability tighten — no LLM required. */
export function readabilityPass(article: GeneratedBlog): GeneratedBlog {
  let content = article.content.replace(/\r\n/g, "\n");

  // Break very long paragraphs
  content = content
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith("#") || block.startsWith("```") || block.startsWith("|")) return block;
      const words = block.trim().split(/\s+/);
      if (words.length < 90) return block;
      const mid = Math.floor(words.length / 2);
      // Prefer split near sentence end
      const joined = words.join(" ");
      const approx = words.slice(0, mid).join(" ").length;
      const window = joined.slice(Math.max(0, approx - 40), approx + 80);
      const m = window.match(/[.!?]\s+/);
      if (!m || m.index == null) {
        return `${words.slice(0, mid).join(" ")}\n\n${words.slice(mid).join(" ")}`;
      }
      const splitAt = Math.max(0, approx - 40) + m.index + m[0].length;
      return `${joined.slice(0, splitAt).trim()}\n\n${joined.slice(splitAt).trim()}`;
    })
    .join("\n\n");

  // Soften common passive / filler openers
  content = content
    .replace(/\bIt is important to note that\b/gi, "")
    .replace(/\bIn order to\b/gi, "To")
    .replace(/\bDue to the fact that\b/gi, "Because")
    .replace(/\bA large number of\b/gi, "Many")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const excerpt =
    article.excerpt.length > 180
      ? `${article.excerpt.slice(0, 177).trim()}...`
      : article.excerpt;

  return {
    ...article,
    content,
    excerpt,
    seoDescription: (article.seoDescription || excerpt).slice(0, 160),
  };
}
