import type { ContentBrief, ResearchAnalysis, ResearchSource } from "@/models";
import { ResearchAnalysisSchema } from "@/models";
import type { LLMProvider } from "@/providers/llm";
import { buildAnalysisPrompt } from "@/prompts/analysis/v1";

export async function analysisStage(
  brief: ContentBrief,
  sources: ResearchSource[],
  llm: LLMProvider,
): Promise<ResearchAnalysis> {
  const usable = sources.filter((s) => !s.fetchError && s.content.length > 40);
  const payload = usable.map((s) => ({
    id: s.id,
    url: s.url,
    title: s.title,
    sourceName: s.sourceName,
    content: s.content.slice(0, 4000),
    relevanceScore: s.relevanceScore,
  }));

  const prompt = buildAnalysisPrompt({
    topic: brief.topic,
    sourcesJson: JSON.stringify(payload, null, 2),
  });

  const analysis = await llm.generateStructured(prompt, ResearchAnalysisSchema);
  const known = new Set(usable.map((s) => s.id));

  // Drop claims that invent source IDs
  const claims = analysis.claims
    .map((c) => ({
      ...c,
      sourceIds: c.sourceIds.filter((id) => known.has(id)),
    }))
    .filter((c) => c.sourceIds.length > 0);

  return ResearchAnalysisSchema.parse({
    ...analysis,
    claims,
  });
}
