import type { BlogOutline, ContentBrief, ResearchAnalysis, ResearchSource } from "@/models";
import { BlogOutlineSchema } from "@/models";
import type { LLMProvider } from "@/providers/llm";
import { buildOutlinePrompt } from "@/prompts/outline/v1";

export async function outlineStage(
  brief: ContentBrief,
  sources: ResearchSource[],
  analysis: ResearchAnalysis,
  llm: LLMProvider,
): Promise<BlogOutline> {
  const sourceIds = sources.map((s) => s.id);
  const known = new Set(sourceIds);
  const prompt = buildOutlinePrompt({
    briefJson: JSON.stringify(brief, null, 2),
    analysisJson: JSON.stringify(analysis, null, 2),
    sourceIds,
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
