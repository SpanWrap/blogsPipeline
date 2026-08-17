export const OUTLINE_PROMPT_VERSION = "v1";

export function buildOutlinePrompt(input: {
  briefJson: string;
  analysisJson: string;
  sourceIds: string[];
  templateMarkdown?: string | null;
}): string {
  const templateBlock = input.templateMarkdown?.trim()
    ? `

Article template (guidelines and required sections). Derive the outline from its headings and instructions:
\`\`\`markdown
${input.templateMarkdown.slice(0, 8000)}
\`\`\`
- Use the template's section headings and order.
- Treat non-heading template prose as instructions for that section's purpose and key points.
- Do not invent major sections missing from the template unless required for research coverage.
`
    : "";

  return `Create a blog outline for this content brief.

Primary inputs: topic/brief, research analysis, and (when present) the article template's sections and instructions.

Prompt version: ${OUTLINE_PROMPT_VERSION}

Brief:
${input.briefJson}

Research analysis:
${input.analysisJson}

Allowed source IDs: ${input.sourceIds.join(", ") || "(none)"}
${templateBlock}
Rules:
- section.sourceIds must only use allowed source IDs
- include intro, body sections, and conclusion purpose (or template-defined sections)
- provide 3 title candidates
- keep key points concrete

Return JSON:
{
  "titleCandidates": string[],
  "sections": [{ "heading": string, "purpose": string, "keyPoints": string[], "sourceIds": string[] }]
}`;
}
