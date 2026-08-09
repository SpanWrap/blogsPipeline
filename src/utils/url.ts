export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
