export const GENERATION_PROMPT_VERSION = "v1";

export function buildGenerationPrompt(input: {
  briefJson: string;
  outlineJson: string;
  analysisJson: string;
  sourcesJson: string;
  templateGuidance?: string | null;
}): string {
  const templateBlock = input.templateGuidance
    ? `

${input.templateGuidance}
`
    : `

No article template was assigned. Use a clear intro, researched body sections from the outline, and a conclusion.
`;

  return `Write a complete original blog article.

Primary inputs (use all of them):
1. Topic / brief
2. Research sources (facts and citations may only come from these)
3. Article template — required sections and writing instructions, when provided
4. Approved outline (should already reflect the template)

Prompt version: ${GENERATION_PROMPT_VERSION}

Topic / brief:
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
- if a template is provided, the article MUST follow its section headings and instructions
- include Markdown headings matching the template when a template is provided
- when the template uses {{body}} or similar placeholders, put the full drafted body text in the content field (template fill happens after generation)
- when the template has no placeholders, content must itself match the template structure
- sources array should list real sources used
- sourceMap maps paragraph indexes to source IDs
- featuredImage should be an https image URL from the sources when one exists (GitHub Open Graph, article hero, etc.)
- embed 1 relevant Markdown image in content when a real https image URL is available, e.g. ![caption](https://...)

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
  "featuredImage": string | null,
  "sources": [{ "title": string, "url": string, "sourceName": string }],
  "sourceMap": [{ "paragraphIndex": number, "sourceIds": string[] }]
}`;
}
