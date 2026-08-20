import type {
  BlogOutline,
  ContentBrief,
  GeneratedBlog,
  ResearchAnalysis,
  ResearchSource,
} from "../../models";
import { GeneratedBlogSchema } from "../../models";
import type { LLMProvider } from "../../providers/llm";
import {
  compactAnalysis,
  compactBrief,
  compactJson,
  compactOutline,
  compactSourcesForGeneration,
  estimateTokens,
  pickSourcesForPrompt,
} from "../../utils/prompt-budget";
import { toSlug } from "../../utils/slug";
import { resolveFeaturedImage } from "../../utils/images";
import { logger } from "../../services/logger";

export function buildStreamDraftPrompt(input: {
  briefJson: string;
  outlineJson: string;
  analysisJson: string;
  sourcesJson: string;
  templateGuidance?: string | null;
}): string {
  const templateBlock = input.templateGuidance
    ? `\nTemplate guidance:\n${input.templateGuidance}\n`
    : "\nNo template. Use intro, body from outline, conclusion.\n";

  return `Write an original blog article in GitHub-flavored Markdown.

Brief: ${input.briefJson}
Outline: ${input.outlineJson}
Analysis: ${input.analysisJson}
Sources: ${input.sourcesJson}
${templateBlock}
Rules:
- Start with a single H1 title (# Title)
- Use H2/H3 for sections from the outline
- Ground claims in the provided sources only; no invented stats
- Clear, scannable prose; no filler
- Do not wrap the whole article in a code fence
- Do not output JSON

Return Markdown only.`;
}

/** Turn a streamed Markdown draft into a GeneratedBlog for the rest of the pipeline. */
export function markdownDraftToArticle(
  markdown: string,
  brief: ContentBrief,
  sources: ResearchSource[],
): GeneratedBlog {
  const text = markdown.replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("Empty draft — nothing to accept");

  const titleMatch = text.match(/^#\s+(.+?)\s*$/m);
  const title = (titleMatch?.[1] || brief.topic).trim();
  const withoutTitle = titleMatch ? text.replace(titleMatch[0], "").trim() : text;
  const firstPara =
    withoutTitle
      .split(/\n\n+/)
      .map((p) => p.replace(/^#+\s+/, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim())
      .find((p) => p.length > 40) || withoutTitle.slice(0, 180);
  const excerpt = firstPara.slice(0, 220).replace(/\s+/g, " ").trim();
  const listed = sources.slice(0, 8).map((s) => ({
    title: s.title,
    url: s.url,
    sourceName: s.sourceName,
  }));
  const tags = Array.from(
    new Set([...(brief.keywords || []).slice(0, 5), ...title.toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 3)]),
  ).slice(0, 8);

  return GeneratedBlogSchema.parse({
    title,
    subtitle: "",
    slug: toSlug(title),
    excerpt: excerpt || `Overview of ${brief.topic}`,
    content: text,
    tags,
    keywords: brief.keywords?.length ? brief.keywords : tags,
    seoTitle: title.slice(0, 60),
    seoDescription: (excerpt || title).slice(0, 160),
    sources: listed,
    sourceMap: [],
    featuredImage: resolveFeaturedImage({
      featuredImage: null,
      content: text,
      sourceUrls: listed.map((s) => s.url),
    }),
  });
}

export async function streamDraftStage(
  brief: ContentBrief,
  sources: ResearchSource[],
  analysis: ResearchAnalysis,
  outline: BlogOutline,
  llm: LLMProvider,
  onDelta: (chunk: string) => void | Promise<void>,
  templateGuidance?: string | null,
  signal?: AbortSignal,
): Promise<string> {
  if (!llm.streamText) {
    throw new Error("Current LLM provider does not support streaming");
  }
  const selected = pickSourcesForPrompt(sources);
  const prompt = buildStreamDraftPrompt({
    briefJson: compactJson(compactBrief(brief)),
    outlineJson: compactJson(compactOutline(outline)),
    analysisJson: compactJson(compactAnalysis(analysis)),
    sourcesJson: compactJson(compactSourcesForGeneration(selected)),
    templateGuidance: templateGuidance?.trim() || null,
  });
  logger.info("Stream draft prompt budget", {
    sources: selected.length,
    approxTokens: estimateTokens(prompt),
  });

  return llm.streamText(prompt, onDelta, {
    system:
      "You are an expert tech blog writer. Stream a complete Markdown article. Never invent sources or statistics.",
    signal,
  });
}
