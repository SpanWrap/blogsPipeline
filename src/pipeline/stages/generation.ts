import type {
  BlogOutline,
  ContentBrief,
  GeneratedBlog,
  ResearchAnalysis,
  ResearchSource,
} from "@/models";
import { GeneratedBlogSchema } from "@/models";
import type { LLMProvider } from "@/providers/llm";
import { buildGenerationPrompt } from "@/prompts/generation/v1";
import { toSlug } from "@/utils/slug";

export async function generationStage(
  brief: ContentBrief,
  sources: ResearchSource[],
  analysis: ResearchAnalysis,
  outline: BlogOutline,
  llm: LLMProvider,
): Promise<GeneratedBlog> {
  const known = new Set(sources.map((s) => s.id));
  const sourcesJson = JSON.stringify(
    sources.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      sourceName: s.sourceName,
      content: s.content.slice(0, 2500),
    })),
    null,
    2,
  );

  const prompt = buildGenerationPrompt({
    briefJson: JSON.stringify(brief, null, 2),
    outlineJson: JSON.stringify(outline, null, 2),
    analysisJson: JSON.stringify(analysis, null, 2),
    sourcesJson,
  });

  const article = await llm.generateStructured(prompt, GeneratedBlogSchema);
  const slug = article.slug ? toSlug(article.slug) : toSlug(article.title);

  // Ensure sources refer only to known research URLs / map
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const listed =
    article.sources.length > 0
      ? article.sources
      : sources.map((s) => ({
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

  // Prefer canonical source URLs from research when IDs known
  const cleanedSources = listed.map((s) => {
    const match = [...sourceById.values()].find((r) => r.url === s.url);
    return {
      title: s.title || match?.title || s.url,
      url: s.url,
      sourceName: s.sourceName || match?.sourceName,
    };
  });

  return GeneratedBlogSchema.parse({
    ...article,
    slug,
    seoTitle: article.seoTitle || article.title,
    seoDescription: article.seoDescription || article.excerpt,
    sources: cleanedSources,
    sourceMap,
  });
}
