export const OUTLINE_PROMPT_VERSION = "v1";

export function buildOutlinePrompt(input: {
  briefJson: string;
  analysisJson: string;
  sourceIds: string[];
  templateMarkdown?: string | null;
}): string {
  const templateBlock = input.templateMarkdown?.trim()
    ? `\nTemplate (required sections/instructions):\n${input.templateMarkdown}\n- Follow template section order/headings.\n`
    : "";

  return `Create a blog outline.

v=${OUTLINE_PROMPT_VERSION}
Brief: ${input.briefJson}
Analysis: ${input.analysisJson}
Allowed source IDs: ${input.sourceIds.join(",") || "(none)"}
${templateBlock}
Rules:
- section.sourceIds only from allowed IDs
- include intro/body/conclusion (or template sections)
- 3 title candidates; concrete key points

Return JSON only:
{"titleCandidates":string[],"sections":[{"heading":string,"purpose":string,"keyPoints":string[],"sourceIds":string[]}]}`;
}
