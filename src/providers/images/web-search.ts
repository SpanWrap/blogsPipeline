import { appConfig } from "../../config";
import { logger } from "../../services/logger";
import {
  hostnameOf,
  isBlockedImageUrl,
  isDirectImageUrl,
  isTrustedFreeImageHost,
} from "../../utils/images";
import type { GeneratedImage, ImageProvider } from "./types";

export type WebImageHit = {
  url: string;
  title: string;
  source?: string;
  license?: string;
};

const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

/** Flickr (and some CDNs) 403 bot UAs — use a normal browser UA for image bytes only. */
const IMAGE_FETCH_UA =
  "Mozilla/5.0 (compatible; SpanwrapImageFetcher/1.0; +https://spanwrap.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export { isDirectImageUrl };

function refererForImage(url: string): string | undefined {
  const host = hostnameOf(url);
  if (/(^|\.)staticflickr\.com$/i.test(host) || host.includes("flickr")) {
    return "https://www.flickr.com/";
  }
  if (host.includes("wikimedia") || host.includes("wikipedia")) {
    return "https://commons.wikimedia.org/";
  }
  if (host.includes("unsplash")) return "https://unsplash.com/";
  if (host.includes("pexels")) return "https://www.pexels.com/";
  if (host.includes("pixabay")) return "https://pixabay.com/";
  return undefined;
}

function dedupeHits(hits: WebImageHit[]): WebImageHit[] {
  const seen = new Set<string>();
  const out: WebImageHit[] = [];
  for (const hit of hits) {
    const key = hit.url.split("?")[0]!.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

function filterDirectHits(hits: WebImageHit[]): WebImageHit[] {
  return hits.filter((h) => isDirectImageUrl(h.url));
}

/** Serper may return random CDNs — keep only known royalty-free hosts. */
function filterRoyaltyFreeHits(hits: WebImageHit[]): WebImageHit[] {
  return hits.filter((h) => isDirectImageUrl(h.url) && isTrustedFreeImageHost(h.url));
}

function cleanImageUrl(url: string): string {
  try {
    const u = new URL(url);
    // Drop tracker noise that some Commons URLs append.
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function searchOpenverseImages(query: string, limit: number): Promise<WebImageHit[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(Math.min(20, Math.max(limit * 3, 10))));
  // Public domain + permissive CC only (commercially safer for blog republishing).
  url.searchParams.set("license", "pdm,cc0,by");
  url.searchParams.set("license_type", "commercial");
  url.searchParams.set("mature", "false");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": appConfig.userAgent },
  });
  if (!response.ok) {
    throw new Error(`Openverse HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    results?: Array<{
      url?: string;
      title?: string;
      foreign_landing_url?: string;
      license?: string;
      license_version?: string;
      provider?: string;
    }>;
  };
  return filterDirectHits(
    (data.results ?? []).map((img) => ({
      url: cleanImageUrl(String(img.url || "").trim()),
      title: String(img.title || query).trim() || query,
      source: img.foreign_landing_url || img.provider,
      license: [img.license, img.license_version].filter(Boolean).join(" "),
    })),
  ).slice(0, limit);
}

async function searchWikimediaImages(query: string, limit: number): Promise<WebImageHit[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap ${query}`);
  url.searchParams.set("gsrlimit", String(Math.min(20, Math.max(limit * 3, 10))));
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": appConfig.userAgent },
  });
  if (!response.ok) {
    throw new Error(`Wikimedia HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          imageinfo?: Array<{
            url?: string;
            mime?: string;
            size?: number;
            extmetadata?: Record<string, { value?: string }>;
          }>;
        }
      >;
    };
  };
  const pages = Object.values(data.query?.pages ?? {});
  const hits: WebImageHit[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const imageUrl = cleanImageUrl(String(info?.url || "").trim());
    if (!isDirectImageUrl(imageUrl)) continue;
    if (info?.mime && !info.mime.startsWith("image/")) continue;
    if (typeof info?.size === "number" && info.size > MAX_DOWNLOAD_BYTES) continue;
    const license =
      info?.extmetadata?.LicenseShortName?.value ||
      info?.extmetadata?.UsageTerms?.value ||
      "wikimedia";
    hits.push({
      url: imageUrl,
      title: String(page.title || query).replace(/^File:/, ""),
      source: "wikimedia",
      license,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * Serper Google Images — last resort only. Restricts to known free-media hosts
 * (Unsplash, Pexels, Pixabay, Wikimedia, Flickr). Never keeps Facebook/social CDNs.
 */
async function searchSerperImages(query: string, limit: number): Promise<WebImageHit[]> {
  const apiKey = appConfig.research.serperApiKey;
  if (!apiKey) return [];
  const freeQuery = [
    query,
    "(site:commons.wikimedia.org OR site:upload.wikimedia.org OR site:unsplash.com OR site:images.unsplash.com OR site:pexels.com OR site:pixabay.com OR site:flickr.com)",
  ].join(" ");
  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: freeQuery,
      num: Math.min(30, Math.max(limit * 4, 12)),
    }),
  });
  if (!response.ok) {
    throw new Error(`Serper images HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    images?: Array<{ imageUrl?: string; title?: string; source?: string; link?: string }>;
  };
  return filterRoyaltyFreeHits(
    (data.images ?? []).map((img) => ({
      url: cleanImageUrl(String(img.imageUrl || "").trim()),
      title: String(img.title || query).trim() || query,
      source: img.source || img.link,
      license: "unverified-serper",
    })),
  ).slice(0, limit);
}

/**
 * Search for royalty-free images with direct URLs.
 * Order: Wikimedia Commons → Openverse (CC) → Serper (trusted hosts only).
 */
export async function searchWebImages(query: string, limit = 4): Promise<WebImageHit[]> {
  const q = query.trim().slice(0, 160);
  if (!q) return [];

  const attempts: Array<{ name: string; run: () => Promise<WebImageHit[]> }> = [
    // Wikimedia first — stable direct URLs that rarely hotlink-block.
    { name: "wikimedia", run: () => searchWikimediaImages(q, limit) },
    { name: "openverse", run: () => searchOpenverseImages(q, limit) },
    { name: "serper", run: () => searchSerperImages(q, limit) },
  ];

  const collected: WebImageHit[] = [];
  for (const attempt of attempts) {
    if (collected.length >= limit) break;
    try {
      const need = limit - collected.length;
      const hits = await attempt.run();
      collected.push(...hits.slice(0, Math.max(need * 2, need)));
      logger.info("Web image search provider ok", {
        provider: attempt.name,
        query: q.slice(0, 80),
        hits: hits.length,
        hostSample: hits.slice(0, 3).map((h) => hostnameOf(h.url)),
      });
    } catch (error) {
      logger.warn("Web image search provider failed", {
        provider: attempt.name,
        query: q.slice(0, 80),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return dedupeHits(collected).slice(0, limit);
}

export async function downloadImageAsBase64(
  imageUrl: string,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isDirectImageUrl(imageUrl)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const headers: Record<string, string> = {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": IMAGE_FETCH_UA,
      };
      const referer = refererForImage(imageUrl);
      if (referer) headers.Referer = referer;
      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers,
        redirect: "follow",
      });
      if (!response.ok) return null;
      // Reject HTML interstitial / login walls disguised as images.
      const finalUrl = response.url || imageUrl;
      if (isBlockedImageUrl(finalUrl)) return null;
      const mime = (response.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
      if (mime && !mime.startsWith("image/")) return null;
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf.length || buf.length > MAX_DOWNLOAD_BYTES) return null;
      // Sniff common magic bytes so we don't store HTML error pages.
      const head = buf.subarray(0, 16);
      const isJpeg = head[0] === 0xff && head[1] === 0xd8;
      const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
      const isGif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46;
      const isWebp = head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP";
      if (!isJpeg && !isPng && !isGif && !isWebp) return null;
      return {
        base64: buf.toString("base64"),
        mimeType: mime && mime.startsWith("image/") ? mime : isPng ? "image/png" : "image/jpeg",
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * Only returns an image if bytes can be downloaded. Never keeps broken remote
 * hotlinks (e.g. Facebook lookaside) as featuredImage.
 */
async function hitToGeneratedImage(
  hit: WebImageHit,
  type: GeneratedImage["type"],
  prompt: string,
): Promise<GeneratedImage | null> {
  const downloaded = await downloadImageAsBase64(hit.url);
  if (!downloaded?.base64) {
    logger.warn("Skipped non-downloadable web image", {
      url: hit.url.slice(0, 120),
      source: hit.source,
    });
    return null;
  }
  return {
    // Keep remote as provenance; saved /api path is applied after materialize.
    url: hit.url,
    base64: downloaded.base64,
    mimeType: downloaded.mimeType,
    prompt,
    type,
    altText: hit.title.slice(0, 120) || prompt.slice(0, 120),
  };
}

async function firstDownloadable(
  hits: WebImageHit[],
  type: GeneratedImage["type"],
  prompt: string,
): Promise<GeneratedImage | null> {
  for (const hit of hits) {
    const img = await hitToGeneratedImage(hit, type, prompt);
    if (img?.base64) return img;
  }
  return null;
}

/**
 * Finds relevant royalty-free web images for a blog post when Gemini
 * generation fails or is unavailable.
 */
export class WebSearchImageProvider implements ImageProvider {
  readonly name = "web-search";

  async generateImage(
    prompt: string,
    _options: { aspectRatio?: string; style?: string } = {},
  ): Promise<GeneratedImage> {
    const hits = await searchWebImages(prompt, 6);
    const img = await firstDownloadable(hits, "hero", prompt);
    if (img) return img;
    return {
      url: null,
      base64: null,
      mimeType: "image/jpeg",
      prompt,
      type: "hero",
      altText: prompt.slice(0, 120),
    };
  }

  async generateBlogImages(article: {
    title: string;
    excerpt: string;
    content: string;
    tags: string[];
  }): Promise<GeneratedImage[]> {
    const images: GeneratedImage[] = [];
    const maxSections = Math.max(0, appConfig.images.maxSectionImages);
    const tagBit = article.tags.slice(0, 3).join(" ");

    const heroQuery = `${article.title} ${tagBit}`.trim();
    const hero = await this.generateImage(heroQuery, { aspectRatio: "16:9" });
    hero.type = "hero";
    hero.altText = `Featured image for ${article.title}`;
    if (hero.base64) images.push(hero);

    const usedUrls = new Set(hero.url ? [hero.url] : []);
    const h2s = (article.content.match(/^## .+$/gm) ?? []).slice(0, maxSections);

    for (const heading of h2s) {
      const clean = heading.replace(/^## /, "").trim();
      const query = `${clean} ${article.title}`.trim();
      const hits = (await searchWebImages(query, 6)).filter((h) => !usedUrls.has(h.url));
      const chosen = await firstDownloadable(hits, "section", query);
      if (!chosen?.base64) continue;
      chosen.altText = `Illustration for: ${clean}`;
      if (chosen.url) usedUrls.add(chosen.url);
      images.push(chosen);
    }

    const socialQuery = `${article.title} technology abstract illustration`.trim();
    const socialHits = (await searchWebImages(socialQuery, 4)).filter((h) => !usedUrls.has(h.url));
    const social = await firstDownloadable(socialHits, "social", socialQuery);
    if (social?.base64) {
      social.type = "social";
      social.altText = `Social card for ${article.title}`;
      images.push(social);
    }

    const usable = images.filter((i) => i.base64);
    if (!usable.length) {
      throw new Error(
        "No downloadable royalty-free images found (Openverse/Wikimedia). Facebook and other social CDN links are blocked because they do not render.",
      );
    }
    return usable;
  }
}
