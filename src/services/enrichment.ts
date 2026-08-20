import type { GeneratedBlog, PipelineRun, ResearchAnalysis, ResearchSource } from "../models";
import { analyzeKeywords, generateMetaSuggestions } from "./seo-research";
import { buildFactCards } from "./fact-cards";
import { buildCompetitorBrief } from "./competitor-brief";
import { buildRepurposePack } from "./repurpose";

export function buildSeoPack(article: GeneratedBlog, topic: string) {
  const kw = analyzeKeywords(topic, article.content);
  const meta = generateMetaSuggestions({
    title: article.title,
    content: article.content,
    tags: article.tags,
  });
  return {
    primaryKeyword: kw.primaryKeyword,
    longTailKeywords: kw.longTailKeywords,
    titles: meta.titles,
    descriptions: meta.descriptions,
    slugSuggestions: meta.slugSuggestions,
  };
}

export function enrichRunView(run: PipelineRun) {
  return {
    factCards: buildFactCards(run.analysis, run.sources),
    competitorBrief: buildCompetitorBrief(run.analysis, run.sources, run.brief.topic),
    seoPack:
      run.seoPack ??
      (run.article ? buildSeoPack(run.article, run.brief.topic) : null),
    repurposePack:
      run.repurposePack ??
      (run.article
        ? buildRepurposePack({
            title: run.article.title,
            slug: run.article.slug,
            excerpt: run.article.excerpt,
            tags: run.article.tags,
            content: run.article.content,
          })
        : null),
  };
}

export function applySeoChoice(
  article: GeneratedBlog,
  choice: { title?: string; description?: string; slug?: string },
): GeneratedBlog {
  return {
    ...article,
    title: choice.title?.trim() || article.title,
    seoTitle: choice.title?.trim() || article.seoTitle,
    seoDescription: choice.description?.trim() || article.seoDescription,
    slug: choice.slug?.trim() || article.slug,
  };
}

export type { ResearchAnalysis, ResearchSource };
