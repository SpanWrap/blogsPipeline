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
    : `\nNo template. Use intro, body from outline, conclusion.\n`;

  return `Write an original blog article from the inputs below. Cite only provided sources.

v=${GENERATION_PROMPT_VERSION}

Brief: ${input.briefJson}
Outline: ${input.outlineJson}
Analysis: ${input.analysisJson}
Sources: ${input.sourcesJson}
${templateBlock}
Rules:
- grounded in sources only; no invented stats/citations
- clear structure; no filler/keyword stuffing
- follow template headings/instructions when provided
- featuredImage: https URL from sources when available
- embed at most 1 real https Markdown image when available

Return JSON only:
{"title":string,"subtitle":string,"slug":string,"excerpt":string,"content":string,"tags":string[],"keywords":string[],"seoTitle":string,"seoDescription":string,"featuredImage":string|null,"sources":[{"title":string,"url":string,"sourceName":string}],"sourceMap":[{"paragraphIndex":number,"sourceIds":string[]}]}`;
}
