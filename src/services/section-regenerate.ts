import type { BlogOutline, ContentBrief, GeneratedBlog, ResearchAnalysis, ResearchSource } from "../models";
import type { LLMProvider } from "../providers/llm";
import { compactBrief, compactJson, compactOutline, compactSourcesForGeneration, pickSourcesForPrompt } from "../utils/prompt-budget";

function splitSections(content: string): Array<{ heading: string; body: string; full: string }> {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ heading: string; body: string; full: string }> = [];
  let current: { heading: string; lines: string[] } | null = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      if (current) {
        const body = current.lines.join("\n").trim();
        sections.push({
          heading: current.heading,
          body,
          full: `## ${current.heading}\n\n${body}`.trim(),
        });
      }
      current = { heading: h2[1]!.trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    const body = current.lines.join("\n").trim();
    sections.push({
      heading: current.heading,
      body,
      full: `## ${current.heading}\n\n${body}`.trim(),
    });
  }
  return sections;
}

export function listArticleSections(content: string): string[] {
  return splitSections(content).map((s) => s.heading);
}

export async function regenerateSection(input: {
  article: GeneratedBlog;
  heading: string;
  brief: ContentBrief;
  outline: BlogOutline | null;
  analysis: ResearchAnalysis | null;
  sources: ResearchSource[];
  llm: LLMProvider;
}): Promise<GeneratedBlog> {
  const sections = splitSections(input.article.content);
  const idx = sections.findIndex(
    (s) => s.heading.toLowerCase() === input.heading.trim().toLowerCase(),
  );
  if (idx < 0) throw new Error(`Section not found: ${input.heading}`);

  const selected = pickSourcesForPrompt(input.sources);
  const outlineHint =
    input.outline?.sections.find((s) => s.heading.toLowerCase() === input.heading.toLowerCase()) ??
    null;
  const prompt = `Rewrite ONLY the Markdown section below. Keep the same ## heading text.
Return ONLY that section (## heading + body). No title, no other sections.

Topic brief: ${compactJson(compactBrief(input.brief))}
Outline for this section: ${outlineHint ? compactJson(outlineHint) : input.heading}
Analysis summary: ${input.analysis?.summary ?? ""}
Sources: ${compactJson(compactSourcesForGeneration(selected))}

Current section:
${sections[idx]!.full}

Rules: grounded in sources only; scannable; no filler.`;

  const rewritten = (await input.llm.generateText(prompt)).trim();
  const cleaned = rewritten.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```$/i, "").trim();
  const nextFull = cleaned.startsWith("##")
    ? cleaned
    : `## ${sections[idx]!.heading}\n\n${cleaned}`;

  const before = input.article.content;
  const startMarker = `## ${sections[idx]!.heading}`;
  const start = before.indexOf(startMarker);
  if (start < 0) throw new Error("Could not locate section in article content");
  const rest = before.slice(start + startMarker.length);
  const nextH2 = rest.search(/\n##\s+/);
  const end = nextH2 >= 0 ? start + startMarker.length + nextH2 : before.length;
  const updated = `${before.slice(0, start).trimEnd()}\n\n${nextFull.trim()}\n\n${before.slice(end).trimStart()}`.trim();

  return { ...input.article, content: updated };
}
