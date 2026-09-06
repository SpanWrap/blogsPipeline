export type QualityIssueLike = {
  severity?: string;
  type?: string;
  message?: string;
};

export type AnchoredQualityIssue = {
  id: string;
  severity: "info" | "warning" | "error";
  type: string;
  message: string;
  /** Where to highlight / scroll */
  field: "title" | "excerpt" | "content" | "document";
  /** Substring to wrap when field is content/title/excerpt */
  matchText?: string;
};

function asSeverity(raw: unknown): AnchoredQualityIssue["severity"] {
  if (raw === "error" || raw === "warning" || raw === "info") return raw;
  return "info";
}

function extractQuoted(message: string): string | null {
  const m = message.match(/"([^"]{3,160})"/) || message.match(/'([^']{3,160})'/);
  return m?.[1]?.trim() || null;
}

function firstParagraph(content: string): string | null {
  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.replace(/^#+\s+.*$/m, "").trim())
    .filter((b) => b.length > 20 && !b.startsWith("```"));
  const p = blocks[0];
  if (!p) return null;
  // Prefer a short unique slice for highlighting.
  const plain = p.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`#]/g, "");
  return plain.slice(0, 120).trim() || null;
}

function lastHeadingOrParagraph(content: string): string | null {
  const headings = content.match(/^#{1,3}\s+.+$/gm);
  if (headings?.length) {
    const last = headings[headings.length - 1]!.replace(/^#+\s+/, "").trim();
    if (last.length >= 3) return last;
  }
  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 20);
  const last = blocks[blocks.length - 1];
  if (!last) return null;
  return last.replace(/^#+\s+/, "").slice(0, 100).trim() || null;
}

function findLongSentence(content: string): string | null {
  const sentences = content
    .replace(/```[\s\S]*?```/g, "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length > 28);
  return sentences[0]?.slice(0, 140) || null;
}

function primaryKeywordFromIssues(issues: QualityIssueLike[]): string | null {
  for (const issue of issues) {
    const msg = String(issue.message || "");
    const m = msg.match(/[Kk]eyword\s+"([^"]+)"/) || msg.match(/Primary keyword/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Map quality issues onto editable fields / body spans for Grammarly-style UX.
 * Document-level issues (no match) still appear in the floating list.
 */
export function anchorQualityIssues(
  issues: QualityIssueLike[] | null | undefined,
  ctx: { title?: string; excerpt?: string; content?: string; keywords?: string[] },
): AnchoredQualityIssue[] {
  const list = Array.isArray(issues) ? issues : [];
  const title = ctx.title || "";
  const excerpt = ctx.excerpt || "";
  const content = ctx.content || "";
  const keywords = (ctx.keywords || []).map((k) => k.trim()).filter(Boolean);
  const primaryKw = keywords[0] || primaryKeywordFromIssues(list);

  return list.map((raw, idx) => {
    const severity = asSeverity(raw.severity);
    const type = String(raw.type || "issue");
    const message = String(raw.message || "");
    const id = `qi-${idx}-${type}`;
    const base = { id, severity, type, message };

    const quoted = extractQuoted(message);

    if (type === "obvious_filler" && quoted && content.toLowerCase().includes(quoted.toLowerCase())) {
      return { ...base, field: "content", matchText: quoted };
    }
    if (type === "unsupported_claim" && quoted) {
      return { ...base, field: "content", matchText: quoted };
    }
    if (type === "plagiarism_detected" && quoted) {
      return { ...base, field: "content", matchText: quoted };
    }
    if (type === "keyword_stuffing" && quoted && content.toLowerCase().includes(quoted.toLowerCase())) {
      return { ...base, field: "content", matchText: quoted };
    }

    if (
      (type.includes("keyword-title") || type === "seo_keyword-title") &&
      primaryKw &&
      title.toLowerCase().includes(primaryKw.toLowerCase())
    ) {
      return { ...base, field: "title", matchText: primaryKw };
    }
    if (
      (type.includes("keyword-title") || type === "seo_keyword-title") &&
      !title.toLowerCase().includes((primaryKw || "").toLowerCase())
    ) {
      // Keyword missing from title — highlight whole title as the problem area.
      return { ...base, field: "title", matchText: title.slice(0, 80) || undefined };
    }

    if (
      (type.includes("keyword-intro") || type === "seo_keyword-intro" || type === "missing_introduction") &&
      firstParagraph(content)
    ) {
      return { ...base, field: "content", matchText: firstParagraph(content)! };
    }

    if (type === "no_intro_before_h2") {
      const intro = firstParagraph(content);
      if (intro) return { ...base, field: "content", matchText: intro };
    }

    if (type === "missing_conclusion") {
      const tail = lastHeadingOrParagraph(content);
      if (tail) return { ...base, field: "content", matchText: tail };
    }

    if (type === "long_sentences") {
      const sent = findLongSentence(content);
      if (sent) return { ...base, field: "content", matchText: sent };
    }

    if (
      type.includes("seo_description") ||
      type.includes("seo_desc") ||
      type === "missing_seo_description"
    ) {
      return { ...base, field: "excerpt", matchText: excerpt.slice(0, 100) || undefined };
    }

    if (type.includes("seo_title") || type === "missing_seo_title" || type === "missing_title") {
      return { ...base, field: "title", matchText: title.slice(0, 80) || undefined };
    }

    if (type === "seo_keyword-density" && primaryKw && content.toLowerCase().includes(primaryKw.toLowerCase())) {
      return { ...base, field: "content", matchText: primaryKw };
    }
    if (type === "seo_keyword-density" && primaryKw) {
      return { ...base, field: "title", matchText: title.slice(0, 80) || undefined };
    }

    // Fallback: try any quoted snippet in body
    if (quoted && content.toLowerCase().includes(quoted.toLowerCase())) {
      return { ...base, field: "content", matchText: quoted };
    }

    return { ...base, field: "document" };
  });
}

/** Wrap the first case-insensitive occurrence of `needle` in a text node tree. */
export function highlightFirstMatch(
  root: HTMLElement,
  needle: string,
  attrs: { id: string; severity: string; message: string },
): boolean {
  if (!needle.trim()) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const lowerNeedle = needle.toLowerCase();
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest("mark.qi-mark, pre, code, script, style")) continue;
    const text = node.textContent || "";
    const idx = text.toLowerCase().indexOf(lowerNeedle);
    if (idx < 0) continue;

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + needle.length);
    const after = text.slice(idx + needle.length);

    const mark = document.createElement("mark");
    mark.className = `qi-mark qi-${attrs.severity}`;
    mark.dataset.qiId = attrs.id;
    mark.dataset.qiMessage = attrs.message;
    mark.dataset.qiSeverity = attrs.severity;
    mark.dataset.qiType = attrs.id;
    mark.textContent = match;

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(mark);
    if (after) frag.appendChild(document.createTextNode(after));
    parent.replaceChild(frag, node);
    return true;
  }
  return false;
}

export function clearQualityMarks(root: HTMLElement): void {
  root.querySelectorAll("mark.qi-mark").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

export function applyContentHighlights(
  root: HTMLElement,
  issues: AnchoredQualityIssue[],
): void {
  clearQualityMarks(root);
  for (const issue of issues) {
    if (issue.field !== "content" || !issue.matchText) continue;
    highlightFirstMatch(root, issue.matchText, {
      id: issue.id,
      severity: issue.severity,
      message: `${issue.severity}: ${issue.message}`,
    });
  }
}
