export const ANALYSIS_PROMPT_VERSION = "v1";

export function buildAnalysisPrompt(input: {
  topic: string;
  sourcesJson: string;
}): string {
  return `You are performing research analysis for a blog about: "${input.topic}".

Prompt version: ${ANALYSIS_PROMPT_VERSION}

Using ONLY the sources below, extract:
- important facts
- statistics
- key arguments
- examples
- competing viewpoints
- terminology
- quotes where appropriate
- claims needing verification

Rules:
- Every claim MUST include sourceIds from the provided source list.
- Never invent source IDs or URLs.
- If unsure, lower confidence and mark category verification_needed.

Sources JSON:
${input.sourcesJson}

Return JSON matching:
{
  "summary": string,
  "claims": [{ "claim": string, "sourceIds": string[], "confidence": number, "category": string }],
  "keyArguments": string[],
  "competingViewpoints": string[],
  "terminology": string[],
  "sourceRelationships": [{ "sourceIds": string[], "relationship": string }]
}`;
}
