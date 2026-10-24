import type { BlogOutline, ContentBriefInput, ResearchAnalysis, ResearchSource } from "../../models";
import { BlogOutlineSchema } from "../../models";
import type { LLMProvider } from "../../providers/llm";
import { buildOutlinePrompt } from "../../prompts/outline/v1";
import {
  compactAnalysis,
  compactBrief,
  compactJson,
  compactTemplateForPrompt,
  estimateTokens,
  pickSourcesForPrompt,
} from "../../utils/prompt-budget";
import { logger } from "../../services/logger";
import { isNoReaderAudience } from "../../services/reader-constants";

export async function outlineStage(
  brief: ContentBriefInput,
  sources: ResearchSource[],
  analysis: ResearchAnalysis,
  llm: LLMProvider,
  templateMarkdown?: string | null,
): Promise<BlogOutline> {
  const selected = pickSourcesForPrompt(sources);
  const sourceIds = selected.map((s) => s.id);
  const known = new Set(sourceIds);
  const prompt = buildOutlinePrompt({
    briefJson: compactJson(compactBrief(brief)),
    analysisJson: compactJson(compactAnalysis(analysis)),
    sourceIds,
    templateMarkdown: templateMarkdown?.trim()
      ? compactTemplateForPrompt(templateMarkdown)
      : null,
    freeReader: isNoReaderAudience(brief.targetAudience),
  });
  logger.info("Outline prompt budget", {
    sources: sourceIds.length,
    approxTokens: estimateTokens(prompt),
  });

  const outline = await llm.generateStructured(prompt, BlogOutlineSchema);
  const cleaned = {
    ...outline,
    titleCandidates: outline.titleCandidates.filter(Boolean).slice(0, 5),
    sections: outline.sections.map((section) => ({
      ...section,
      sourceIds: section.sourceIds.filter((id) => known.has(id)),
    })),
  };
  return BlogOutlineSchema.parse(cleaned);
}
