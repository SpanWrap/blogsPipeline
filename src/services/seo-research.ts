import { appConfig } from "../config";
import { logger } from "./logger";

export type KeywordAnalysis = {
  primaryKeyword: string;
  longTailKeywords: string[];
  searchVolume: number;
  difficulty: number;
  suggestions: string[];
};

export type MetaSuggestions = {
  titles: string[];
  descriptions: string[];
  slugSuggestions: string[];
};

export type SEOIssue = {
  type: string;
  message: string;
  severity: "info" | "warning" | "error";
};

export type SEOScore = {
  score: number;
  issues: SEOIssue[];
};

function extractWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").split(/\s+/).filter(Boolean);
}

function countOccurrences(text: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "gi");
  return (text.match(re) ?? []).length;
}

function generateLongTail(topic: string): string[] {
  const prefixes = ["how to", "best", "top", "why", "what is", "guide to"];
  const suffixes = ["tutorial", "guide", "examples", "best practices", "in 2024", "for beginners"];
  const results: string[] = [];
  for (const p of prefixes) results.push(`${p} ${topic}`);
  for (const s of suffixes) results.push(`${topic} ${s}`);
  return results;
}

export function analyzeKeywords(topic: string, _content?: string): KeywordAnalysis {
  const words = extractWords(topic);
  const primary = words.join(" ");
  const longTail = generateLongTail(primary);
  const wordCount = words.length;
  const difficulty = Math.min(100, Math.max(10, wordCount <= 2 ? 70 : 40));
  const volume = wordCount <= 2 ? 5000 : 1500;

  logger.info("Analyzed keywords", { topic, primary });
  return {
    primaryKeyword: primary,
    longTailKeywords: longTail.slice(0, 8),
    searchVolume: volume,
    difficulty,
    suggestions: longTail.slice(0, 5),
  };
}

export function generateMetaSuggestions(article: {
  title: string;
  content: string;
  tags?: string[];
}): MetaSuggestions {
  const { title, content, tags = [] } = article;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const firstSentence = content.split(/[.!?]\s/)[0] ?? "";
  const tagStr = tags.length > 0 ? ` — ${tags.slice(0, 3).join(", ")}` : "";

  return {
    titles: [
      title,
      `${title}: A Complete Guide`,
      `Everything You Need to Know About ${title}`,
    ],
    descriptions: [
      firstSentence.slice(0, 160),
      `Learn about ${title.toLowerCase()}${tagStr}. ${firstSentence}`.slice(0, 160),
      `Discover ${title.toLowerCase()} — tips, examples, and best practices.`.slice(0, 160),
    ],
    slugSuggestions: [
      slug,
      slug.split("-").slice(0, 5).join("-"),
      `guide-${slug.split("-").slice(0, 4).join("-")}`,
    ],
  };
}

export function scoreSEO(article: {
  title: string;
  content: string;
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string[];
  slug?: string;
}): SEOScore {
  const { title, content, seoTitle, seoDescription, keywords = [], slug } = article;
  const issues: SEOIssue[] = [];
  let score = 100;
  const cfg = appConfig.seo;
  const effectiveTitle = seoTitle ?? title;
  const primaryKeyword = keywords[0]?.toLowerCase() ?? "";
  const wordCount = extractWords(content).length;

  // Title length
  if (effectiveTitle.length < cfg.minTitleLength) {
    issues.push({ type: "title-length", message: `Title too short (${effectiveTitle.length} chars, min ${cfg.minTitleLength})`, severity: "warning" });
    score -= 10;
  } else if (effectiveTitle.length > cfg.maxTitleLength) {
    issues.push({ type: "title-length", message: `Title too long (${effectiveTitle.length} chars, max ${cfg.maxTitleLength})`, severity: "warning" });
    score -= 5;
  }

  // Meta description length
  if (seoDescription) {
    if (seoDescription.length < cfg.minDescLength) {
      issues.push({ type: "desc-length", message: `Meta description too short (${seoDescription.length} chars, min ${cfg.minDescLength})`, severity: "warning" });
      score -= 10;
    } else if (seoDescription.length > cfg.maxDescLength) {
      issues.push({ type: "desc-length", message: `Meta description too long (${seoDescription.length} chars, max ${cfg.maxDescLength})`, severity: "warning" });
      score -= 5;
    }
  } else {
    issues.push({ type: "desc-missing", message: "No meta description provided", severity: "error" });
    score -= 15;
  }

  // Keyword in title
  if (primaryKeyword && !effectiveTitle.toLowerCase().includes(primaryKeyword)) {
    issues.push({ type: "keyword-title", message: "Primary keyword not found in title", severity: "error" });
    score -= 15;
  }

  // Keyword in first paragraph
  if (primaryKeyword) {
    const firstParagraph = content.split(/\n\n/)[0] ?? "";
    if (!firstParagraph.toLowerCase().includes(primaryKeyword)) {
      issues.push({ type: "keyword-intro", message: "Primary keyword not in first paragraph", severity: "warning" });
      score -= 10;
    }
  }

  // Keyword density
  if (primaryKeyword && wordCount > 0) {
    const count = countOccurrences(content, primaryKeyword);
    const density = count / wordCount;
    const target = cfg.targetKeywordDensity;
    if (density < target * 0.5) {
      issues.push({ type: "keyword-density", message: `Keyword density too low (${(density * 100).toFixed(1)}%, target ~${(target * 100).toFixed(0)}%)`, severity: "warning" });
      score -= 10;
    } else if (density > target * 2) {
      issues.push({ type: "keyword-density", message: `Keyword density too high (${(density * 100).toFixed(1)}%) — may appear spammy`, severity: "warning" });
      score -= 10;
    }
  }

  // Heading structure
  const headings = content.match(/^#{1,6}\s/gm) ?? [];
  if (headings.length === 0) {
    issues.push({ type: "headings", message: "No headings found — add H2/H3 for structure", severity: "warning" });
    score -= 10;
  }

  // Slug check
  if (slug) {
    if (/[A-Z]/.test(slug)) {
      issues.push({ type: "slug", message: "Slug contains uppercase characters", severity: "info" });
      score -= 2;
    }
    if (slug.length > 75) {
      issues.push({ type: "slug", message: "Slug is very long — consider shortening", severity: "info" });
      score -= 2;
    }
  }

  // Readability: average sentence length
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  if (sentences.length > 0) {
    const avgWords = sentences.reduce((sum, s) => sum + extractWords(s).length, 0) / sentences.length;
    if (avgWords > 25) {
      issues.push({ type: "readability", message: `Average sentence length is high (${avgWords.toFixed(0)} words) — aim for under 20`, severity: "info" });
      score -= 5;
    }
  }

  // Internal link opportunities
  const linkCount = (content.match(/\[.*?\]\(.*?\)/g) ?? []).length;
  if (linkCount === 0 && wordCount > 300) {
    issues.push({ type: "internal-links", message: "No links found — consider adding internal links", severity: "info" });
    score -= 5;
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}
