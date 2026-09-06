export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Turn a blog/article URL into a readable topic (slug → Title Case). */
export function topicFromBlogUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1] || url.hostname.replace(/^www\./, "");
    const cleaned = decodeURIComponent(slug)
      .replace(/\.(html?|md|php|aspx?)$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length < 3) return url.hostname.replace(/^www\./, "");
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 140);
  } catch {
    return value.trim().slice(0, 140);
  }
}

/**
 * Normalize New-run input where the user may paste a blog URL as the topic
 * and/or in a dedicated source URL field.
 */
export function normalizeBriefUrls(input: {
  topic?: string | null;
  sourceUrl?: string | null;
  referenceUrls?: string[] | null;
}): { topic: string; referenceUrls: string[] } {
  const referenceUrls: string[] = [];
  const pushUrl = (raw: string) => {
    const value = raw.trim();
    if (!isValidHttpUrl(value)) return;
    try {
      const normalized = normalizeUrl(value);
      if (!referenceUrls.includes(normalized)) referenceUrls.push(normalized);
    } catch {
      /* skip */
    }
  };

  for (const u of input.referenceUrls ?? []) pushUrl(String(u));
  if (input.sourceUrl) pushUrl(String(input.sourceUrl));

  let topic = String(input.topic ?? "").trim();
  if (topic && isValidHttpUrl(topic)) {
    pushUrl(topic);
    topic = topicFromBlogUrl(topic);
  }
  if (topic.length < 3 && referenceUrls[0]) {
    topic = topicFromBlogUrl(referenceUrls[0]);
  }
  return { topic, referenceUrls };
}

export function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  // drop common tracking params
  const drop = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
  for (const key of drop) url.searchParams.delete(key);
  // trailing slash normalize (keep root slash)
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function sourceNameFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function assertSafeUrl(value: string): URL {
  if (!isValidHttpUrl(value)) {
    throw new Error(`Invalid URL: ${value}`);
  }
  const url = new URL(value);
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    // Allow localhost only in tests via explicit flag
    if (process.env.ALLOW_PRIVATE_URLS !== "1") {
      throw new Error(`Private/local URLs are not allowed: ${host}`);
    }
  }
  return url;
}
