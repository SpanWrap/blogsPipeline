export const OUTLINE_PROMPT_VERSION = "v2";

export function buildOutlinePrompt(input: {
  briefJson: string;
  analysisJson: string;
  sourceIds: string[];
  templateMarkdown?: string | null;
}): string {
  const templateBlock = input.templateMarkdown?.trim()
    ? `\nTemplate (required sections/instructions):\n${input.templateMarkdown}\n- Follow template section order/headings.\n`
    : "";

  return `Create a detailed long-form blog outline (enough structure for an 8–12 minute read).

v=${OUTLINE_PROMPT_VERSION}
Brief: ${input.briefJson}
Analysis: ${input.analysisJson}
Allowed source IDs: ${input.sourceIds.join(",") || "(none)"}
${templateBlock}
Rules:
- section.sourceIds only from allowed IDs
- unless a template dictates otherwise: include intro, 5–8 body sections, and conclusion
- each body section needs a clear purpose and 4–6 concrete keyPoints (examples, comparisons, pitfalls, how-tos)
- cover context/why-now, core concepts, practical application, trade-offs or alternatives, and takeaways
- 3 title candidates; prefer specific, curiosity-driven titles over vague ones

Return JSON only:
{"titleCandidates":string[],"sections":[{"heading":string,"purpose":string,"keyPoints":string[],"sourceIds":string[]}]}`;
}
