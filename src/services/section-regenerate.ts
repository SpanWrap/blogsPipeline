import type { BlogOutline, ContentBriefInput, GeneratedBlog, ResearchAnalysis, ResearchSource } from "../models";
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
  brief: ContentBriefInput;
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

function findSelectionSpan(content: string, selectedText: string): { start: number; end: number } | null {
  const needle = selectedText.trim();
  if (!needle) return null;
  const exact = content.indexOf(needle);
  if (exact >= 0) return { start: exact, end: exact + needle.length };

  // Fallback: ignore runs of whitespace so rich-editor plain selection can match Markdown.
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const target = norm(needle);
  if (!target) return null;
  const hay = norm(content);
  const at = hay.indexOf(target);
  if (at < 0) return null;

  let hi = 0;
  let start = -1;
  let end = -1;
  for (let ci = 0; ci < content.length; ci++) {
    const ch = content[ci]!;
    if (/\s/.test(ch)) {
      if (hi < hay.length && hay[hi] === " ") hi++;
      continue;
    }
    if (hi === at && start < 0) start = ci;
    hi++;
    if (start >= 0 && hi === at + target.length) {
      end = ci + 1;
      break;
    }
  }
  return start >= 0 && end > start ? { start, end } : null;
}

/** Rewrite a selected passage using an instruction (Quick Edit). */
export async function regenerateSelection(input: {
  article: GeneratedBlog;
  selectedText: string;
  instruction: string;
  /** Optional live editor markdown; defaults to article.content. */
  content?: string;
  brief: ContentBriefInput;
  sources: ResearchSource[];
  llm: LLMProvider;
}): Promise<{ article: GeneratedBlog; replacement: string }> {
  const selected = input.selectedText.trim();
  const instruction = input.instruction.trim();
  if (selected.length < 2) throw new Error("Select at least a few characters to regenerate");
  if (instruction.length < 2) throw new Error("Add a regeneration instruction");

  const content = (input.content ?? input.article.content).replace(/\r\n/g, "\n");
  const span = findSelectionSpan(content, selected);
  if (!span) {
    throw new Error("Could not locate the selected text in the article. Select again and retry.");
  }

  const selectedSources = pickSourcesForPrompt(input.sources);
  const prompt = `Rewrite the SELECTED PASSAGE only, following the instruction.
Return ONLY the replacement text (Markdown allowed). No preamble, no quotes, no code fences.

Topic: ${compactJson(compactBrief(input.brief))}
Sources (ground claims here): ${compactJson(compactSourcesForGeneration(selectedSources))}

Instruction: ${instruction}

Selected passage:
"""
${content.slice(span.start, span.end)}
"""

Surrounding context (do not rewrite this; use only for continuity):
"""
${content.slice(Math.max(0, span.start - 280), span.start)}
⟦SELECTION⟧
${content.slice(span.end, Math.min(content.length, span.end + 280))}
"""`;

  const rewritten = (await input.llm.generateText(prompt)).trim();
  const replacement = rewritten
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  if (!replacement) throw new Error("Model returned an empty rewrite");

  const updatedContent = `${content.slice(0, span.start)}${replacement}${content.slice(span.end)}`;
  return {
    article: { ...input.article, content: updatedContent },
    replacement,
  };
}
