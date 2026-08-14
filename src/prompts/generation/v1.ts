export const GENERATION_PROMPT_VERSION = "v1";

export function buildGenerationPrompt(input: {
  briefJson: string;
  outlineJson: string;
  analysisJson: string;
  sourcesJson: string;
  templateGuidance?: string | null;
}): string {
  const templateBlock = input.templateGuidance
    ? `\n${input.templateGuidance}\n`
    : "";

  return `Write a complete original blog article from the brief, outline, and source-backed research.

Prompt version: ${GENERATION_PROMPT_VERSION}

Brief:
${input.briefJson}

Approved outline:
${input.outlineJson}

Research analysis:
${input.analysisJson}

Sources:
${input.sourcesJson}
${templateBlock}
Rules:
- useful, readable, original, well structured
- factually grounded in provided sources only
- no fake statistics or fake citations
- no keyword stuffing or AI filler
- avoid repetitive intros/conclusions
- include Markdown headings matching the template when a template is provided
- if a Markdown template is provided, the article structure MUST follow it
- when the template uses {{body}} or similar placeholders, put the full drafted body text in the content field (template fill happens after generation)
- when the template has no placeholders, content must itself match the template structure
- sources array should list real sources used
- sourceMap maps paragraph indexes to source IDs

Return JSON:
{
  "title": string,
  "subtitle": string,
  "slug": string,
  "excerpt": string,
  "content": string,
  "tags": string[],
  "keywords": string[],
  "seoTitle": string,
  "seoDescription": string,
  "sources": [{ "title": string, "url": string, "sourceName": string }],
  "sourceMap": [{ "paragraphIndex": number, "sourceIds": string[] }]
}`;
}
