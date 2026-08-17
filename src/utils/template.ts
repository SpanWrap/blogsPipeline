/**
 * Helpers for Markdown article templates used during blog generation.
 *
 * Supported placeholders (optional):
 *   {{title}} {{subtitle}} {{slug}} {{excerpt}}
 *   {{seoTitle}} {{seoDescription}}
 *   {{tags}} {{keywords}}
 *   {{body}}   — researched article body
 *   {{sources}} — bullet list of source links
 *
 * If the template has no placeholders, generation is instructed to mirror
 * the template structure (headings, section order, style) directly.
 */

export function templateHasPlaceholders(markdown: string): boolean {
  return listPlaceholders(markdown).length > 0;
}

export function listPlaceholders(markdown: string): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export type TemplateFillValues = {
  title: string;
  subtitle?: string;
  slug?: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  tags?: string[];
  keywords?: string[];
  body: string;
  sources?: Array<{ title: string; url: string; sourceName?: string }>;
};

function formatSources(
  sources: Array<{ title: string; url: string; sourceName?: string }> = [],
): string {
  if (!sources.length) return "";
  return sources
    .map((s) => {
      const label = s.sourceName ? `${s.title} (${s.sourceName})` : s.title;
      return `- [${label}](${s.url})`;
    })
    .join("\n");
}

/**
 * Fill `{{placeholders}}` in a template. Unknown placeholders are left as-is.
 * When there are no placeholders, returns `values.body` (caller already generated structured content).
 */
export function applyMarkdownTemplate(
  templateMarkdown: string,
  values: TemplateFillValues,
): string {
  if (!templateHasPlaceholders(templateMarkdown)) {
    return values.body;
  }

  const map: Record<string, string> = {
    title: values.title,
    subtitle: values.subtitle ?? "",
    slug: values.slug ?? "",
    excerpt: values.excerpt ?? "",
    seoTitle: values.seoTitle ?? values.title,
    seoDescription: values.seoDescription ?? values.excerpt ?? "",
    tags: (values.tags ?? []).join(", "),
    keywords: (values.keywords ?? []).join(", "),
    body: values.body,
    sources: formatSources(values.sources),
  };

  return templateMarkdown.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return map[key] ?? "";
    }
    return full;
  });
}

/** Build short guidance text for prompts from a template. */
export function describeTemplateForPrompt(templateMarkdown: string): string {
  const placeholders = listPlaceholders(templateMarkdown);
  const lines = [
    "ARTICLE TEMPLATE — GUIDELINES AND REQUIRED SECTIONS",
    "This markdown is a first-class input alongside the topic and research sources.",
    "Treat headings as required sections. Treat other template prose as writing instructions (what to cover, tone, length, do/don't).",
    "```markdown",
    templateMarkdown.slice(0, 12_000),
    "```",
  ];
  if (placeholders.length) {
    lines.push(
      "",
      `Template placeholders present: ${placeholders.map((p) => `{{${p}}}`).join(", ")}`,
      "- Produce article body that fills the research substance for {{body}} (or whole document if structure-only).",
      "- Keep the template's section order, headings, and formatting conventions.",
      "- Follow any section-level instructions in the template; do not invent extra major sections unless the template allows flexibility.",
    );
  } else {
    lines.push(
      "",
      "- Mirror this template's structure exactly: heading levels, section order, and any labeled sections.",
      "- Replace placeholder/example prose with research-backed original writing that still obeys the section instructions.",
      "- Keep stylistic conventions (lists, callouts, FAQ blocks, etc.) where they appear in the template.",
      "- The `content` field of the JSON response must be valid Markdown following this structure.",
    );
  }
  return lines.join("\n");
}
