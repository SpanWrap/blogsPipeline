export const GENERATION_PROMPT_VERSION = "v2";

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

  return `Write an original long-form tech blog article from the inputs below. Cite only provided sources.

v=${GENERATION_PROMPT_VERSION}

Brief: ${input.briefJson}
Outline: ${input.outlineJson}
Analysis: ${input.analysisJson}
Sources: ${input.sourcesJson}
${templateBlock}
Length & depth (required):
- Target 1,800–2,500 words in content (about 8–12 minutes reading time). Do not stop early.
- Expand every outline section: 2–4 substantial paragraphs each, not one thin paragraph.
- Include concrete examples, trade-offs, edge cases, and practical steps grounded in the sources.
- Prefer specificity over generic advice; explain why, not only what.
- Use short paragraphs and scannable H2/H3 headings; add bullet or numbered lists where they help clarity.
- For technical topics, include at least one realistic code or config example when sources support it.

Rules:
- grounded in sources only; no invented stats/citations
- when a source is marked as a primary/reference blog URL, treat it as the main grounding document and rewrite the ideas originally (do not copy prose)
- clear structure; no filler/keyword stuffing or padded repetition
- follow template headings/instructions when provided
- featuredImage: https URL from sources when available
- embed at most 1 real https Markdown image when available
- end with a conclusion that synthesizes takeaways and a clear next step for the reader

Return JSON only:
{"title":string,"subtitle":string,"slug":string,"excerpt":string,"content":string,"tags":string[],"keywords":string[],"seoTitle":string,"seoDescription":string,"featuredImage":string|null,"sources":[{"title":string,"url":string,"sourceName":string}],"sourceMap":[{"paragraphIndex":number,"sourceIds":string[]}]}`;
}
