import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { appConfig } from "@/config";
import { logger } from "@/services/logger";
import { withRetry } from "@/utils/retry";
import { assertSafeUrl, normalizeUrl } from "@/utils/url";

export type ExtractedPage = {
  url: string;
  title: string;
  sourceName: string;
  content: string;
  publishedAt: string | null;
};

const REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
  ".nav",
  ".navbar",
  ".footer",
  ".header",
  ".sidebar",
  ".advertisement",
  ".ads",
  ".ad",
  ".cookie",
  ".social",
  ".share",
  ".newsletter",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
].join(",");

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

async function fetchText(url: string, timeoutMs = appConfig.requestTimeoutMs): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": appConfig.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} fetching ${url}`) as Error & {
        status: number;
      };
      error.status = response.status;
      throw error;
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function isAllowedByRobots(pageUrl: string): Promise<boolean> {
  if (!appConfig.respectRobotsTxt) return true;
  try {
    const url = assertSafeUrl(pageUrl);
    const robotsUrl = `${url.origin}/robots.txt`;
    let robots = robotsCache.get(url.origin);
    if (!robots) {
      try {
        const body = await fetchText(robotsUrl, 10_000);
        robots = robotsParser(robotsUrl, body);
      } catch {
        robots = robotsParser(robotsUrl, "");
      }
      robotsCache.set(url.origin, robots);
    }
    return robots.isAllowed(pageUrl, appConfig.userAgent) !== false;
  } catch {
    return true;
  }
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractMainContent($: cheerio.CheerioAPI): string {
  $("body").find(REMOVE_SELECTORS).remove();

  const candidates = [
    "article",
    "main",
    "[role='main']",
    ".post-content",
    ".article-content",
    ".entry-content",
    "#content",
    ".content",
  ];

  let rootSelector = "body";
  for (const sel of candidates) {
    const node = $(sel).first();
    if (node.length && node.text().trim().length > 200) {
      rootSelector = sel;
      break;
    }
  }

  const root = $(rootSelector).first();
  const parts: string[] = [];
  root.find("h1,h2,h3,h4,p,li,blockquote,pre").each((_, el) => {
    const tag = "tagName" in el && typeof el.tagName === "string" ? el.tagName.toLowerCase() : "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) return;
    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
      parts.push(`\n## ${text}\n`);
    } else if (tag === "li") {
      parts.push(`- ${text}`);
    } else if (tag === "blockquote") {
      parts.push(`> ${text}`);
    } else {
      parts.push(text);
    }
  });

  if (parts.length === 0) {
    return normalizeWhitespace(root.text());
  }
  return normalizeWhitespace(parts.join("\n\n"));
}

export function extractFromHtml(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    "Untitled";
  const publishedAt =
    $("meta[property='article:published_time']").attr("content") ||
    $("time[datetime]").attr("datetime") ||
    null;
  const content = extractMainContent($);
  const sourceName = new URL(pageUrl).hostname.replace(/^www\./, "");
  return {
    url: normalizeUrl(pageUrl),
    title,
    sourceName,
    content,
    publishedAt,
  };
}

export async function fetchAndExtract(pageUrl: string): Promise<ExtractedPage> {
  const url = assertSafeUrl(pageUrl).toString();
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    throw new Error(`Blocked by robots.txt: ${url}`);
  }

  const html = await withRetry(
    async () => fetchText(url),
    {
      maxAttempts: appConfig.retry.maxAttempts,
      baseDelayMs: appConfig.retry.baseDelayMs,
      shouldRetry: (error) => {
        const status = (error as { status?: number }).status;
        if (status === 404 || status === 401 || status === 403) return false;
        return true;
      },
      onRetry: (error, attempt, delayMs) => {
        logger.warn("Retrying page fetch", {
          url,
          attempt,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    },
  );

  const extracted = extractFromHtml(html, url);
  if (!extracted.content || extracted.content.length < 40) {
    throw new Error(`Empty or insufficient content extracted from ${url}`);
  }
  return extracted;
}
