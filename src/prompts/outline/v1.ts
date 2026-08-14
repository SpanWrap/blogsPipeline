export const OUTLINE_PROMPT_VERSION = "v1";

export function buildOutlinePrompt(input: {
  briefJson: string;
  analysisJson: string;
  sourceIds: string[];
  templateMarkdown?: string | null;
}): string {
  const templateBlock = input.templateMarkdown?.trim()
    ? `

Markdown article template to respect (derive outline sections from its headings/order when present):
\`\`\`markdown
${input.templateMarkdown.slice(0, 8000)}
\`\`\`
- Prefer section headings that match the template.
- Do not invent major sections missing from the template unless required for research coverage.
`
    : "";

  return `Create a blog outline for this content brief.

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
