export const OUTLINE_PROMPT_VERSION = "v1";

export function buildOutlinePrompt(input: {
  briefJson: string;
  analysisJson: string;
  sourceIds: string[];
}): string {
  return `Create a blog outline for this content brief.

Prompt version: ${OUTLINE_PROMPT_VERSION}

Brief:
${input.briefJson}

Research analysis:
${input.analysisJson}

Allowed source IDs: ${input.sourceIds.join(", ") || "(none)"}

Rules:
- section.sourceIds must only use allowed source IDs
- include intro, body sections, and conclusion purpose
- provide 3 title candidates
- keep key points concrete

Return JSON:
{
  "titleCandidates": string[],
  "sections": [{ "heading": string, "purpose": string, "keyPoints": string[], "sourceIds": string[] }]
}`;
}
