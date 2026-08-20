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
import { compactTemplateForPrompt } from "./prompt-budget";
export function templateHasPlaceholders(markdown) {
    return listPlaceholders(markdown).length > 0;
}
export function listPlaceholders(markdown) {
    const found = new Set();
    for (const match of markdown.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
        if (match[1])
            found.add(match[1]);
    }
    return [...found];
}
function formatSources(sources = []) {
    if (!sources.length)
        return "";
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
export function applyMarkdownTemplate(templateMarkdown, values) {
    if (!templateHasPlaceholders(templateMarkdown)) {
        return values.body;
    }
    const map = {
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
    return templateMarkdown.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
        if (Object.prototype.hasOwnProperty.call(map, key)) {
            return map[key] ?? "";
        }
        return full;
    });
}
/** Build short guidance text for prompts from a template. */
export function describeTemplateForPrompt(templateMarkdown) {
    const placeholders = listPlaceholders(templateMarkdown);
    const compact = compactTemplateForPrompt(templateMarkdown);
    const lines = [
        "TEMPLATE",
        "Headings = required sections. Other prose = writing instructions.",
        compact,
    ];
    if (placeholders.length) {
        lines.push(`Placeholders: ${placeholders.map((p) => `{{${p}}}`).join(", ")}`, "Fill research substance into {{body}} / matching structure; keep section order.");
    }
    else {
        lines.push("Mirror heading order and style. Replace example prose with research-backed writing.", "`content` must be Markdown following this structure.");
    }
    return lines.join("\n");
}
