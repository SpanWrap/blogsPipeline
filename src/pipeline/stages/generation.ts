import type {
  BlogOutline,
  ContentBriefInput,
  GeneratedBlog,
  ResearchAnalysis,
  ResearchSource,
} from "../../models";
import { GeneratedBlogSchema } from "../../models";
import type { LLMProvider } from "../../providers/llm";
import { buildGenerationPrompt } from "../../prompts/generation/v1";
import { toSlug } from "../../utils/slug";
import { resolveFeaturedImage } from "../../utils/images";
import {
  applyMarkdownTemplate,
  describeTemplateForPrompt,
  templateHasPlaceholders,
} from "../../utils/template";
import {
  compactAnalysis,
  compactBrief,
  compactJson,
  compactOutline,
  compactSourcesForGeneration,
  estimateTokens,
  pickSourcesForPrompt,
} from "../../utils/prompt-budget";
import { logger } from "../../services/logger";
import { isNoReaderAudience } from "../../services/reader-constants";

export async function generationStage(
  brief: ContentBriefInput,
  sources: ResearchSource[],
  analysis: ResearchAnalysis,
  outline: BlogOutline,
  llm: LLMProvider,
  templateMarkdown?: string | null,
): Promise<GeneratedBlog> {
  const selected = pickSourcesForPrompt(sources);
  const known = new Set(selected.map((s) => s.id));
  const sourcesJson = compactJson(compactSourcesForGeneration(selected));

  const templateGuidance = templateMarkdown?.trim()
    ? describeTemplateForPrompt(templateMarkdown)
    : null;

  const prompt = buildGenerationPrompt({
    briefJson: compactJson(compactBrief(brief)),
    outlineJson: compactJson(compactOutline(outline)),
    analysisJson: compactJson(compactAnalysis(analysis)),
    sourcesJson,
    templateGuidance,
    freeReader: isNoReaderAudience(brief.targetAudience),
  });
  logger.info("Generation prompt budget", {
    sources: selected.length,
    approxTokens: estimateTokens(prompt),
  });

  const article = await llm.generateStructured(prompt, GeneratedBlogSchema);
  const slug = article.slug ? toSlug(article.slug) : toSlug(article.title);

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const listed =
    article.sources.length > 0
      ? article.sources
      : selected.map((s) => ({
          title: s.title,
          url: s.url,
          sourceName: s.sourceName,
        }));

  const sourceMap = (article.sourceMap ?? [])
    .map((m) => ({
      ...m,
      sourceIds: m.sourceIds.filter((id) => known.has(id)),
    }))
    .filter((m) => m.sourceIds.length > 0);

  const cleanedSources = listed.map((s) => {
    const match = [...sourceById.values()].find((r) => r.url === s.url);
    return {
      title: s.title || match?.title || s.url,
      url: s.url,
      sourceName: s.sourceName || match?.sourceName,
    };
  });

  let content = article.content;
  if (templateMarkdown?.trim() && templateHasPlaceholders(templateMarkdown)) {
    content = applyMarkdownTemplate(templateMarkdown, {
      title: article.title,
      subtitle: article.subtitle,
      slug,
      excerpt: article.excerpt,
      seoTitle: article.seoTitle || article.title,
      seoDescription: article.seoDescription || article.excerpt,
      tags: article.tags,
      keywords: article.keywords,
      body: article.content,
      sources: cleanedSources,
    });
  }

  return GeneratedBlogSchema.parse({
    ...article,
    slug,
    content,
    seoTitle: article.seoTitle || article.title,
    seoDescription: article.seoDescription || article.excerpt,
    sources: cleanedSources,
    sourceMap,
    featuredImage: resolveFeaturedImage({
      featuredImage: article.featuredImage,
      content,
      sourceUrls: cleanedSources.map((s) => s.url),
    }),
  });
}
