import type {
  GeneratedBlog,
  QualityIssue,
  QualityResult,
  ResearchAnalysis,
  ResearchSource,
} from "../../models";
import { isValidHttpUrl } from "../../utils/url";

type SeoIssueLike = string | { type?: string; message?: string; severity?: string };

let scoreSEO:
  | ((article: GeneratedBlog) => { score: number; issues: SeoIssueLike[] })
  | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../../services/seo-research");
  if (typeof mod?.scoreSEO === "function") scoreSEO = mod.scoreSEO;
} catch {
  // seo-research service not available yet – skip SEO scoring
}

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

function h2Count(content: string): number {
  return (content.match(/^##\s+/gm) ?? []).length;
}

function hasIntroBeforeFirstH2(content: string): boolean {
  const idx = content.search(/^##\s+/m);
  if (idx === -1) return true;
  const before = content.slice(0, idx).replace(/^#\s+.*$/m, "").trim();
  return before.length > 40;
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

function extractSentences(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/^#+\s+.*$/gm, "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 300);
}

function checkPlagiarism(
  article: string,
  sources: ResearchSource[],
): { ratio: number; matched: string[] } {
  const sentences = extractSentences(article);
  if (sentences.length === 0) return { ratio: 0, matched: [] };

  const sample = sentences
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(5, Math.max(3, sentences.length)));

  const sourceCorpus = sources
    .map((s) => s.content.toLowerCase())
    .join("\n");

  const matched: string[] = [];
  for (const sent of sample) {
    const normalized = sent.toLowerCase().replace(/\s+/g, " ");
    if (sourceCorpus.includes(normalized)) {
      matched.push(sent.slice(0, 80));
    }
  }

  return { ratio: matched.length / sample.length, matched };
}

function averageSentenceLength(text: string): number {
  const sentences = extractSentences(text);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + wordCount(s), 0);
  return totalWords / sentences.length;
}

function averageParagraphSentenceCount(text: string): number {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20 && !p.startsWith("#") && !p.startsWith("```"));
  if (paragraphs.length === 0) return 0;
  const counts = paragraphs.map(
    (p) => (p.match(/[.!?]+/g) ?? []).length || 1,
  );
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}

function detectPassiveVoice(text: string): number {
  const pattern = /\b(?:was|were|been|being)\s+\w+(?:ed|en)\b/gi;
  return (text.match(pattern) ?? []).length;
}

function hasCodeBlocks(content: string): boolean {
  return /```[\s\S]*?```/.test(content);
}

function isTechnicalTopic(article: GeneratedBlog): boolean {
  const techKeywords = /\b(?:api|code|programming|software|developer|typescript|javascript|python|react|node|database|sql|docker|kubernetes|git|cli|framework|library|sdk|http|rest|graphql)\b/i;
  return (
    techKeywords.test(article.title) ||
    techKeywords.test(article.content.slice(0, 500)) ||
    (article.tags ?? []).some((t) => techKeywords.test(t))
  );
}

function checkFactualConsistency(
  article: string,
  analysis: ResearchAnalysis | null | undefined,
): string[] {
  if (!analysis?.claims?.length) return [];

  const unsupported: string[] = [];
  const claimTexts = analysis.claims.map((c) => c.claim.toLowerCase());

  const articleSentences = extractSentences(article);
  const claimPatterns = claimTexts.map((c) => {
    const keywords = c
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 5);
    return keywords;
  });

  const statPattern = /\b\d[\d,.]*\s*(?:%|percent|million|billion|thousand)\b/gi;
  const articleClaims = articleSentences.filter((s) => statPattern.test(s));

  for (const claim of articleClaims) {
    const claimLower = claim.toLowerCase();
    const hasSupport = claimPatterns.some((keywords) => {
      if (keywords.length === 0) return true;
      const matchCount = keywords.filter((kw) => claimLower.includes(kw)).length;
      return matchCount >= Math.ceil(keywords.length * 0.5);
    });
    if (!hasSupport) {
      unsupported.push(claim.slice(0, 100));
    }
  }

  return unsupported;
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
  analysis?: ResearchAnalysis | null,
): QualityResult {
  const issues: QualityIssue[] = [];
  let score = 100;

  const add = (
    severity: QualityIssue["severity"],
    type: string,
    message: string,
    penalty: number,
  ) => {
    issues.push({
      severity,
      type: String(type || "issue"),
      message: typeof message === "string" ? message : String(message),
    });
    score -= penalty;
  };

  // ── Content checks ──
  if (!article.title?.trim()) add("error", "missing_title", "Title is missing.", 25);
  if (!article.content?.trim()) add("error", "empty_content", "Article content is empty.", 40);
  const words = wordCount(article.content);
  // ~200 wpm → 1,800 words ≈ 9 min; flag thin posts that won't hold readers.
  if (words < 1200) {
    add(
      "warning",
      "short_content",
      `Article is short (${words} words). Aim for 1,800–2,500 words (~8–12 min read).`,
      words < 800 ? 18 : 12,
    );
  } else if (words < 1600) {
    add(
      "info",
      "below_target_length",
      `Article is ${words} words — a bit under the 1,800–2,500 target.`,
      4,
    );
  }
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

  // ── Plagiarism detection ──
  const plagiarism = checkPlagiarism(article.content, sources);
  if (plagiarism.ratio > 0.4) {
    add(
      "warning",
      "plagiarism_detected",
      `${Math.round(plagiarism.ratio * 100)}% of sampled sentences appear verbatim in sources: ${plagiarism.matched.join("; ")}`,
      15,
    );
  }

  // ── Content structure ──
  if (!hasIntroBeforeFirstH2(article.content)) {
    add("warning", "no_intro_before_h2", "No intro paragraph before first H2 heading.", 5);
  }
  const h2s = h2Count(article.content);
  if (h2s < 5) add("warning", "too_few_h2", `Only ${h2s} H2 headings (5–10 ideal for long-form).`, 5);
  if (h2s > 12) add("info", "many_h2", `${h2s} H2 headings (5–10 ideal).`, 2);

  if (isTechnicalTopic(article) && !hasCodeBlocks(article.content)) {
    add("info", "missing_code_blocks", "Technical topic but no code blocks found.", 3);
  }

  const sourcesCitedInContent = article.sources.some((s) =>
    article.content.includes(s.url) || article.content.toLowerCase().includes(s.title.toLowerCase()),
  );
  if (article.sources.length > 0 && !sourcesCitedInContent) {
    add("info", "sources_not_cited_inline", "Sources are listed but not referenced in body text.", 3);
  }

  // ── Readability ──
  const avgSentLen = averageSentenceLength(article.content);
  if (avgSentLen > 25) {
    add("warning", "long_sentences", `Average sentence length is ${Math.round(avgSentLen)} words (aim for ≤25).`, 5);
  }

  const avgParaLen = averageParagraphSentenceCount(article.content);
  if (avgParaLen > 5) {
    add("warning", "long_paragraphs", `Average paragraph has ${avgParaLen.toFixed(1)} sentences (aim for ≤5).`, 4);
  }

  const passiveCount = detectPassiveVoice(article.content);
  const passiveRatio = words > 0 ? passiveCount / (words / 20) : 0;
  if (passiveRatio > 0.3) {
    add("info", "passive_voice", `High passive voice usage (${passiveCount} instances detected).`, 3);
  }

  // ── Factual consistency ──
  const unsupported = checkFactualConsistency(article.content, analysis);
  if (unsupported.length > 0) {
    for (const claim of unsupported.slice(0, 3)) {
      add("warning", "unsupported_claim", `Claim not found in research: "${claim}"`, 5);
    }
  }

  // ── Source checks ──
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
      add(
        "warning",
        "unverified_source",
        `Cited URL was not in research set: ${s.url}`,
        6,
      );
    }
  }

  const knownIds = new Set(sources.map((s) => s.id));
  for (const mapping of article.sourceMap ?? []) {
    for (const id of mapping.sourceIds) {
      if (!knownIds.has(id)) {
        add("error", "fabricated_citation", `sourceMap references unknown source id ${id}`, 20);
      }
    }
  }

  const statMatches = article.content.match(/\b\d{1,3}(?:\.\d+)?%/g) ?? [];
  if (statMatches.length > 0 && article.sources.length === 0) {
    add(
      "warning",
      "missing_source",
      "Percentage statistics present but no sources listed.",
      10,
    );
  }

  // ── SEO checks (existing) ──
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

  for (const kw of article.keywords ?? []) {
    if (!kw.trim()) continue;
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const count = (article.content.match(re) ?? []).length;
    if (count > 25) {
      add("warning", "keyword_stuffing", `Keyword "${kw}" appears ${count} times.`, 8);
    }
  }

  // ── SEO scoring via seo-research service (optional) ──
  let seoWeight = 0;
  let seoScore = 100;
  if (scoreSEO) {
    try {
      const result = scoreSEO(article);
      seoScore = result.score;
      seoWeight = 0.3;
      for (const issue of result.issues) {
        const message =
          typeof issue === "string"
            ? issue
            : typeof issue?.message === "string"
              ? issue.message
              : JSON.stringify(issue);
        const type =
          typeof issue === "object" && issue && typeof issue.type === "string"
            ? `seo_${issue.type}`
            : "seo_issue";
        const severity =
          typeof issue === "object" &&
          issue &&
          (issue.severity === "info" || issue.severity === "warning" || issue.severity === "error")
            ? issue.severity
            : "warning";
        add(severity, type, message, 0);
      }
    } catch {
      // scoreSEO threw – skip SEO weighting
    }
  }

  // ── Final scoring ──
  score = Math.max(0, Math.min(100, score));
  if (seoWeight > 0) {
    score = Math.round(score * (1 - seoWeight) + seoScore * seoWeight);
  }
  score = Math.max(0, Math.min(100, score));

  const hasError = issues.some((i) => i.severity === "error");
  return {
    passed: !hasError && score >= 60,
    score,
    issues,
  };
}
