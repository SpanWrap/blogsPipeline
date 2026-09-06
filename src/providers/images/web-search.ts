import { appConfig } from "../../config";
import { logger } from "../../services/logger";
import { isValidHttpUrl } from "../../utils/url";
import type { GeneratedImage, ImageProvider } from "./types";

export type WebImageHit = {
  url: string;
  title: string;
  source?: string;
};

const SKIP_HOST_PARTS = ["logo", "sprite", "icon", "avatar", "emoji", "tracking", "1x1"];
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

function looksLikeImageUrl(url: string): boolean {
  if (!isValidHttpUrl(url)) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith("data:")) return false;
  if (SKIP_HOST_PARTS.some((p) => lower.includes(p))) return false;
  return true;
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

async function searchSerperImages(query: string, limit: number): Promise<WebImageHit[]> {
  const apiKey = appConfig.research.serperApiKey;
  if (!apiKey) return [];
  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: Math.min(20, Math.max(limit * 2, 8)) }),
  });
  if (!response.ok) {
    throw new Error(`Serper images HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    images?: Array<{ imageUrl?: string; title?: string; source?: string; link?: string }>;
  };
  return (data.images ?? [])
    .map((img) => ({
      url: String(img.imageUrl || "").trim(),
      title: String(img.title || query).trim() || query,
      source: img.source || img.link,
    }))
    .filter((h) => looksLikeImageUrl(h.url))
    .slice(0, limit);
}

async function searchOpenverseImages(query: string, limit: number): Promise<WebImageHit[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(Math.min(20, Math.max(limit * 2, 8))));
  url.searchParams.set("license", "pdm,cc0,by,by-sa");
  url.searchParams.set("mature", "false");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": appConfig.userAgent },
  });
  if (!response.ok) {
    throw new Error(`Openverse HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    results?: Array<{ url?: string; title?: string; foreign_landing_url?: string }>;
  };
  return (data.results ?? [])
    .map((img) => ({
      url: String(img.url || "").trim(),
      title: String(img.title || query).trim() || query,
      source: img.foreign_landing_url,
    }))
    .filter((h) => looksLikeImageUrl(h.url))
    .slice(0, limit);
}

async function searchWikimediaImages(query: string, limit: number): Promise<WebImageHit[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap ${query}`);
  url.searchParams.set("gsrlimit", String(Math.min(20, Math.max(limit * 2, 8))));
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size");
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
          imageinfo?: Array<{ url?: string; mime?: string; size?: number }>;
        }
      >;
    };
  };
  const pages = Object.values(data.query?.pages ?? {});
  const hits: WebImageHit[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const imageUrl = String(info?.url || "").trim();
    if (!looksLikeImageUrl(imageUrl)) continue;
    if (info?.mime && !info.mime.startsWith("image/")) continue;
    if (typeof info?.size === "number" && info.size > MAX_DOWNLOAD_BYTES) continue;
    hits.push({
      url: imageUrl,
      title: String(page.title || query).replace(/^File:/, ""),
      source: "wikimedia",
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Search the web for relevant images (Serper → Openverse → Wikimedia). */
export async function searchWebImages(query: string, limit = 5): Promise<WebImageHit[]> {
  const q = query.trim().slice(0, 160);
  if (!q) return [];

  const attempts: Array<() => Promise<WebImageHit[]>> = [
    () => searchSerperImages(q, limit),
    () => searchOpenverseImages(q, limit),
    () => searchWikimediaImages(q, limit),
  ];

  const collected: WebImageHit[] = [];
  for (const attempt of attempts) {
    try {
      const hits = await attempt();
      collected.push(...hits);
      if (collected.length >= limit) break;
    } catch (error) {
      logger.warn("Web image search provider failed", {
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
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          Accept: "image/*,*/*",
          "User-Agent": appConfig.userAgent,
        },
        redirect: "follow",
      });
      if (!response.ok) return null;
      const mime = (response.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
      if (mime && !mime.startsWith("image/")) return null;
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf.length || buf.length > MAX_DOWNLOAD_BYTES) return null;
      return {
        base64: buf.toString("base64"),
        mimeType: mime && mime.startsWith("image/") ? mime : "image/jpeg",
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

async function hitToGeneratedImage(
  hit: WebImageHit,
  type: GeneratedImage["type"],
  prompt: string,
): Promise<GeneratedImage> {
  const downloaded = await downloadImageAsBase64(hit.url);
  return {
    url: hit.url,
    base64: downloaded?.base64 ?? null,
    mimeType: downloaded?.mimeType ?? "image/jpeg",
    prompt,
    type,
    altText: hit.title.slice(0, 120) || prompt.slice(0, 120),
  };
}

/**
 * Finds relevant public-web images for a blog post when Gemini generation fails
 * or is unavailable.
 */
export class WebSearchImageProvider implements ImageProvider {
  readonly name = "web-search";

  async generateImage(
    prompt: string,
    _options: { aspectRatio?: string; style?: string } = {},
  ): Promise<GeneratedImage> {
    const hits = await searchWebImages(prompt, 3);
    if (!hits.length) {
      return {
        url: null,
        base64: null,
        mimeType: "image/jpeg",
        prompt,
        type: "hero",
        altText: prompt.slice(0, 120),
      };
    }
    for (const hit of hits) {
      const img = await hitToGeneratedImage(hit, "hero", prompt);
      if (img.base64 || img.url) return img;
    }
    return {
      url: hits[0]!.url,
      base64: null,
      mimeType: "image/jpeg",
      prompt,
      type: "hero",
      altText: hits[0]!.title.slice(0, 120),
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
    images.push(hero);

    const usedUrls = new Set(hero.url ? [hero.url] : []);
    const h2s = (article.content.match(/^## .+$/gm) ?? []).slice(0, maxSections);

    for (const heading of h2s) {
      const clean = heading.replace(/^## /, "").trim();
      const query = `${clean} ${article.title}`.trim();
      const hits = (await searchWebImages(query, 4)).filter((h) => !usedUrls.has(h.url));
      if (!hits.length) continue;
      let chosen: GeneratedImage | null = null;
      for (const hit of hits) {
        const img = await hitToGeneratedImage(hit, "section", query);
        if (img.base64 || img.url) {
          chosen = img;
          chosen.altText = `Illustration for: ${clean}`;
          if (img.url) usedUrls.add(img.url);
          break;
        }
      }
      if (chosen) images.push(chosen);
    }

    const socialQuery = `${article.title} technology abstract`.trim();
    const socialHits = (await searchWebImages(socialQuery, 3)).filter((h) => !usedUrls.has(h.url));
    if (socialHits.length) {
      const social = await hitToGeneratedImage(socialHits[0]!, "social", socialQuery);
      social.type = "social";
      social.altText = `Social card for ${article.title}`;
      images.push(social);
    }

    const usable = images.filter((i) => i.base64 || i.url);
    if (!usable.length) {
      throw new Error(
        "Web image search found no usable images. Try a more specific topic or set SERPER_API_KEY.",
      );
    }
    return images;
  }
}
