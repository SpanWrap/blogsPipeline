import { escapeHtml } from "./utils";

export function markdownToEditorHtml(md: string | null | undefined): string {
  if (!md) return "";
  const codeBlocks: string[] = [];
  let safe = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    const i = codeBlocks.length;
    codeBlocks.push(`<pre class="pre"><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return `\n%%CODEBLOCK_${i}%%\n`;
  });
  safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
  safe = safe.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    (_m, alt, src) =>
      `<figure class="post-figure"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" /><figcaption>${escapeHtml(alt)}</figcaption></figure>`,
  );
  safe = safe.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  safe = safe.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/(?<![*\w])\*([^*]+)\*(?![*\w])/g, "<em>$1</em>");
  safe = safe.replace(/^---+$/gm, "<hr>");
  safe = safe.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  safe = safe.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  safe = safe.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  safe = safe.replace(/^\d+\.\s+(.+)$/gm, "<oli>$1</oli>");
  safe = safe.replace(/(<oli>.*<\/oli>\n?)+/g, (list) =>
    `<ol>${list.replace(/<\/?oli>/g, (t) => t.replace("oli", "li"))}</ol>`,
  );
  safe = safe.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>");
  safe = safe.replace(/(<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`);
  const lines = safe.split(/\n\n+/);
  const html = lines
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^<(h[1-6]|ul|ol|pre|figure|hr|blockquote)/.test(trimmed)) return trimmed;
      if (/^%%CODEBLOCK_\d+%%$/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
  return html.replace(/%%CODEBLOCK_(\d+)%%/g, (_m, i) => codeBlocks[Number(i)] || "");
}

export function htmlToMarkdown(html: string): string {
  if (!html || typeof document === "undefined") return "";
  const div = document.createElement("div");
  div.innerHTML = html;

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const children = () => Array.from(el.childNodes).map(walk).join("");

    switch (tag) {
      case "h1":
        return `\n# ${children().trim()}\n\n`;
      case "h2":
        return `\n## ${children().trim()}\n\n`;
      case "h3":
        return `\n### ${children().trim()}\n\n`;
      case "strong":
      case "b":
        return `**${children()}**`;
      case "em":
      case "i":
        return `*${children()}*`;
      case "a": {
        const href = el.getAttribute("href") || "";
        const text = children().trim();
        return href ? `[${text}](${href})` : text;
      }
      case "code": {
        if (el.parentElement?.tagName === "PRE") return children();
        return `\`${children()}\``;
      }
      case "pre": {
        const code = el.querySelector("code");
        const text = code ? code.textContent : el.textContent;
        return `\n\`\`\`\n${(text || "").trim()}\n\`\`\`\n\n`;
      }
      case "img": {
        const alt = el.getAttribute("alt") || "Image";
        const src = el.getAttribute("src") || "";
        return `![${alt}](${src})`;
      }
      case "figure": {
        const img = el.querySelector("img");
        if (img) {
          const alt = img.getAttribute("alt") || "Image";
          const src = img.getAttribute("src") || "";
          return `\n![${alt}](${src})\n\n`;
        }
        return children();
      }
      case "figcaption":
        return "";
      case "mark":
        // Quality highlights must not leak into saved markdown.
        return children();
      case "ul": {
        const items = Array.from(el.querySelectorAll(":scope > li"));
        return "\n" + items.map((li) => `- ${walk(li).trim()}`).join("\n") + "\n\n";
      }
      case "ol": {
        const items = Array.from(el.querySelectorAll(":scope > li"));
        return "\n" + items.map((li, i) => `${i + 1}. ${walk(li).trim()}`).join("\n") + "\n\n";
      }
      case "li":
        return children();
      case "p":
        return `${children().trim()}\n\n`;
      case "br":
        return "\n";
      case "hr":
        return "\n---\n\n";
      case "div":
        return `${children()}\n`;
      case "blockquote": {
        const inner = children()
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n");
        return `\n${inner}\n\n`;
      }
      default:
        return children();
    }
  }

  return Array.from(div.childNodes)
    .map(walk)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBlockedFeaturedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|instagram\.com|cdninstagram\.com|threads\.net|tiktok\.com|pinterest\.com|pinimg\.com)/i.test(
      host,
    );
  } catch {
    return true;
  }
}

export function featuredImageFor(run: { article?: any; sources?: any[]; thumbnailVariants?: any[] }, articleOverride?: any): string | null {
  const a = articleOverride || run.article;
  if (!a) return null;
  const candidates = [
    a.featuredImage,
    ...(Array.isArray(run.thumbnailVariants)
      ? run.thumbnailVariants
          .slice()
          .sort((x: any, y: any) => Number(Boolean(y?.selected)) - Number(Boolean(x?.selected)))
          .map((v: any) => v?.url)
      : []),
  ];
  for (const raw of candidates) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) continue;
    // Same-origin generated assets always render.
    if (url.startsWith("/api/runs/")) return url;
    // Absolute http(s) — skip social hotlinks that browsers block.
    if (/^https?:\/\//i.test(url) && !isBlockedFeaturedHost(url)) return url;
  }
  const md = String(a.content || "").match(
    /!\[[^\]]*]\(\s*((?:https?:\/\/|\/api\/runs\/)[^)\s]+)\s*\)/,
  );
  if (md?.[1]) {
    const src = md[1];
    if (src.startsWith("/api/runs/") || !isBlockedFeaturedHost(src)) return src;
  }
  const gh = (a.sources || [])
    .map((s: any) => s.url)
    .find((u: string) => /github\.com\/[^/]+\/[^/]+/i.test(u || ""));
  if (gh) {
    const m = gh.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (m) return `https://opengraph.githubassets.com/1/${m[1]}/${m[2]}`;
  }
  return null;
}
