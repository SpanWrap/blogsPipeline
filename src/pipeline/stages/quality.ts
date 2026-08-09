import type {
  GeneratedBlog,
  QualityIssue,
  QualityResult,
  ResearchSource,
} from "@/models";
import { isValidHttpUrl } from "@/utils/url";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasIntroduction(content: string): boolean {
  const first = content.split(/\n{2,}/)[0] ?? "";
  return first.replace(/^#.*$/m, "").trim().length > 40;
}

function hasConclusion(content: string): boolean {
  return /##?\s*(conclusion|wrap[-\s]?up|final thoughts|takeaways)/i.test(content);
}

function headingCount(content: string): number {
  return (content.match(/^#{1,3}\s+/gm) ?? []).length;
}

function paragraphRepetitionScore(content: string): number {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 40);
  if (paragraphs.length < 2) return 0;
  let dups = 0;
  const seen = new Set<string>();
  for (const p of paragraphs) {
    const key = p.slice(0, 120);
    if (seen.has(key)) dups += 1;
    seen.add(key);
  }
  return dups / paragraphs.length;
}

const FILLER_PHRASES = [
  "in today's fast-paced world",
  "it goes without saying",
  "in conclusion, it is important to note",
  "leverage synergies",
  "revolutionize the way",
  "unlock the power of",
  "in this comprehensive guide",
];

export function qualityStage(
  article: GeneratedBlog,
  sources: ResearchSource[],
): QualityResult {
  const issues: QualityIssue[] = [];
  let score = 100;

  const add = (severity: QualityIssue["severity"], type: string, message: string, penalty: number) => {
    issues.push({ severity, type, message });
    score -= penalty;
  };

  // Content checks
  if (!article.title?.trim()) add("error", "missing_title", "Title is missing.", 25);
  if (!article.content?.trim()) add("error", "empty_content", "Article content is empty.", 40);
  const words = wordCount(article.content);
  if (words < 250) add("warning", "short_content", `Article is short (${words} words).`, 10);
  if (words > 4000) add("info", "long_content", `Article is long (${words} words).`, 2);
  if (!hasIntroduction(article.content)) {
    add("warning", "missing_introduction", "Introduction looks weak or missing.", 8);
  }
  if (!hasConclusion(article.content)) {
    add("warning", "missing_conclusion", "No clear conclusion heading found.", 6);
  }
  const headings = headingCount(article.content);
  if (headings === 0) add("warning", "missing_headings", "No Markdown headings found.", 8);
  if (headings > 20) add("warning", "excessive_headings", "Too many headings.", 5);

  const rep = paragraphRepetitionScore(article.content);
  if (rep > 0.2) {
    add("warning", "repetitive_content", "Paragraphs look excessively repetitive.", 12);
  }

  const lower = article.content.toLowerCase();
  for (const phrase of FILLER_PHRASES) {
    if (lower.includes(phrase)) {
      add("warning", "obvious_filler", `Filler phrase detected: "${phrase}"`, 5);
    }
  }

  // Source checks
  const researchUrls = new Set(sources.map((s) => s.url));
  const citedUrls = new Set<string>();
  for (const s of article.sources) {
    if (!isValidHttpUrl(s.url)) {
      add("error", "invalid_source_url", `Invalid source URL: ${s.url}`, 15);
      continue;
    }
    if (citedUrls.has(s.url)) {
      add("warning", "duplicate_source", `Duplicate source URL: ${s.url}`, 4);
    }
    citedUrls.add(s.url);
    if (!researchUrls.has(s.url) && !s.url.includes("example.com")) {
      // For mock/demo example.com is acceptable; otherwise flag
      add(
        "warning",
        "unverified_source",
        `Cited URL was not in research set: ${s.url}`,
        6,
      );
    }
  }

  // sourceMap IDs must exist
  const knownIds = new Set(sources.map((s) => s.id));
  for (const mapping of article.sourceMap ?? []) {
    for (const id of mapping.sourceIds) {
      if (!knownIds.has(id)) {
        add("error", "fabricated_citation", `sourceMap references unknown source id ${id}`, 20);
      }
    }
  }

  // Heuristic: numbers that look like statistics without nearby cite note
  const statMatches = article.content.match(/\b\d{1,3}(?:\.\d+)?%/g) ?? [];
  if (statMatches.length > 0 && article.sources.length === 0) {
    add(
      "warning",
      "missing_source",
      "Percentage statistics present but no sources listed.",
      10,
    );
  }

  // SEO checks
  if (!article.slug?.trim()) add("error", "missing_slug", "Slug is missing.", 10);
  if (article.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) {
    add("warning", "invalid_slug", "Slug should be lowercase kebab-case.", 5);
  }
  if (!article.seoTitle?.trim()) add("warning", "missing_seo_title", "SEO title missing.", 5);
  if (article.seoTitle && article.seoTitle.length > 70) {
    add("info", "seo_title_long", "SEO title is longer than 70 characters.", 2);
  }
  if (!article.seoDescription?.trim()) {
    add("warning", "missing_seo_description", "SEO description missing.", 5);
  }
  if (article.seoDescription && article.seoDescription.length > 160) {
    add("info", "seo_description_long", "SEO description is longer than 160 characters.", 2);
  }
  if ((article.keywords ?? []).length === 0) {
    add("info", "missing_keywords", "No keywords set.", 2);
  }

  // Keyword stuffing heuristic
  for (const kw of article.keywords ?? []) {
    if (!kw.trim()) continue;
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const count = (article.content.match(re) ?? []).length;
    if (count > 25) {
      add("warning", "keyword_stuffing", `Keyword "${kw}" appears ${count} times.`, 8);
    }
  }

  score = Math.max(0, Math.min(100, score));
  const hasError = issues.some((i) => i.severity === "error");
  return {
    passed: !hasError && score >= 60,
    score,
    issues,
  };
}
