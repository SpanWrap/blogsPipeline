import type { ContentBrief, ResearchAnalysis, ResearchSource } from "../../models";
import { ResearchAnalysisSchema } from "../../models";
import type { LLMProvider } from "../../providers/llm";
import { buildAnalysisPrompt } from "../../prompts/analysis/v1";
import {
  compactJson,
  compactSourcesForAnalysis,
  estimateTokens,
} from "../../utils/prompt-budget";
import { logger } from "../../services/logger";

export async function analysisStage(
  brief: ContentBrief,
  sources: ResearchSource[],
  llm: LLMProvider,
): Promise<ResearchAnalysis> {
  const payload = compactSourcesForAnalysis(sources);
  const prompt = buildAnalysisPrompt({
    topic: brief.topic,
    sourcesJson: compactJson(payload),
  });
  logger.info("Analysis prompt budget", {
    sources: payload.length,
    approxTokens: estimateTokens(prompt),
  });

  const analysis = await llm.generateStructured(prompt, ResearchAnalysisSchema);
  const known = new Set(payload.map((s) => String(s.id)));

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
