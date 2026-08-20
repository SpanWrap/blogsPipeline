import type {
  BlogOutline,
  ContentBrief,
  ResearchAnalysis,
  ResearchSource,
} from "../models";
import { appConfig } from "../config";

/** Rough token estimate (~4 chars per token for English/JSON). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Keep the start of long text; drop noise whitespace. */
export function truncateForPrompt(text: string, maxChars: number): string {
  const cleaned = collapseWhitespace(text);
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** Compact JSON without pretty-print whitespace. */
export function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

export type PromptBudget = {
  maxSources: number;
  analysisSourceChars: number;
  generationSourceChars: number;
  maxClaims: number;
  maxClaimChars: number;
  maxTemplateChars: number;
  maxKeyPoints: number;
};

export function getPromptBudget(): PromptBudget {
  return {
    maxSources: appConfig.llm.promptMaxSources,
    analysisSourceChars: appConfig.llm.promptAnalysisSourceChars,
    generationSourceChars: appConfig.llm.promptGenerationSourceChars,
    maxClaims: appConfig.llm.promptMaxClaims,
    maxClaimChars: appConfig.llm.promptMaxClaimChars,
    maxTemplateChars: appConfig.llm.promptMaxTemplateChars,
    maxKeyPoints: appConfig.llm.promptMaxKeyPoints,
  };
}

/** Highest-relevance usable sources, capped for token cost. */
export function pickSourcesForPrompt(
  sources: ResearchSource[],
  limit = getPromptBudget().maxSources,
): ResearchSource[] {
  return [...sources]
    .filter((s) => !s.fetchError && s.content.trim().length > 40)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, Math.max(1, limit));
}

export function compactBrief(brief: ContentBrief): Record<string, unknown> {
  return {
    topic: truncateForPrompt(brief.topic, 200),
    audience: truncateForPrompt(brief.targetAudience, 80),
    tone: truncateForPrompt(brief.tone, 60),
    type: truncateForPrompt(brief.contentType, 40),
    keywords: brief.keywords.slice(0, 8).map((k) => truncateForPrompt(k, 40)),
  };
}

export function compactSourcesForAnalysis(
  sources: ResearchSource[],
  budget = getPromptBudget(),
): Array<Record<string, unknown>> {
  return pickSourcesForPrompt(sources, budget.maxSources).map((s) => ({
    id: s.id,
    title: truncateForPrompt(s.title, 120),
    url: s.url,
    source: truncateForPrompt(s.sourceName, 60),
    score: Number(s.relevanceScore.toFixed(2)),
    text: truncateForPrompt(s.content, budget.analysisSourceChars),
  }));
}

export function compactSourcesForGeneration(
  sources: ResearchSource[],
  budget = getPromptBudget(),
): Array<Record<string, unknown>> {
  return pickSourcesForPrompt(sources, budget.maxSources).map((s) => ({
    id: s.id,
    title: truncateForPrompt(s.title, 100),
    url: s.url,
    text: truncateForPrompt(s.content, budget.generationSourceChars),
  }));
}

/** Slim analysis for outline/generation (claims are the expensive part). */
export function compactAnalysis(
  analysis: ResearchAnalysis,
  budget = getPromptBudget(),
): Record<string, unknown> {
  const claims = [...analysis.claims]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, budget.maxClaims)
    .map((c) => ({
      claim: truncateForPrompt(c.claim, budget.maxClaimChars),
      sourceIds: c.sourceIds.slice(0, 3),
      confidence: Number(c.confidence.toFixed(2)),
      category: c.category,
    }));

  return {
    summary: truncateForPrompt(analysis.summary, 500),
    claims,
    keyArguments: analysis.keyArguments.slice(0, 6).map((a) => truncateForPrompt(a, 160)),
    competingViewpoints: analysis.competingViewpoints
      .slice(0, 4)
      .map((v) => truncateForPrompt(v, 140)),
    terminology: analysis.terminology.slice(0, 12).map((t) => truncateForPrompt(t, 40)),
  };
}

export function compactOutline(
  outline: BlogOutline,
  budget = getPromptBudget(),
): Record<string, unknown> {
  return {
    titles: outline.titleCandidates.slice(0, 3).map((t) => truncateForPrompt(t, 100)),
    sections: outline.sections.map((s) => ({
      heading: truncateForPrompt(s.heading, 100),
      purpose: truncateForPrompt(s.purpose, 160),
      keyPoints: s.keyPoints.slice(0, budget.maxKeyPoints).map((p) => truncateForPrompt(p, 120)),
      sourceIds: s.sourceIds.slice(0, 4),
    })),
  };
}

/** Prefer headings + short instructions over pasting a huge sample article. */
export function compactTemplateForPrompt(
  templateMarkdown: string,
  budget = getPromptBudget(),
): string {
  const raw = templateMarkdown.trim();
  if (!raw) return "";

  const headings = [...raw.matchAll(/^#{1,3}\s+.+$/gm)].map((m) => m[0]!.trim());
  const instructions = raw
    .split(/\n{2,}/)
    .map((block) => collapseWhitespace(block))
    .filter((block) => block && !/^#{1,3}\s/.test(block))
    .slice(0, 8)
    .map((block) => truncateForPrompt(block, 220));

  const compact = [
    headings.length ? `Sections:\n${headings.slice(0, 16).join("\n")}` : "",
    instructions.length ? `Instructions:\n- ${instructions.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (compact.length >= 80) {
    return truncateForPrompt(compact, budget.maxTemplateChars);
  }

  return truncateForPrompt(raw, budget.maxTemplateChars);
}
