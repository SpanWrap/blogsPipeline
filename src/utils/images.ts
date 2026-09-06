import { isValidHttpUrl } from "./url";

const MD_IMAGE = /!\[[^\]]*]\(\s*<?((?:https?:\/\/|\/api\/runs\/)[^)\s>]+)>?\s*\)/gi;

/** Social / stock hosts that hotlink-block or are not safe to republish. */
const BLOCKED_HOST_RE =
  /(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|instagram\.com|cdninstagram\.com|threads\.net|tiktok\.com|twitter\.com|twimg\.com|x\.com|pinterest\.com|pinimg\.com|linkedin\.com|licdn\.com|reddit\.com|redd\.it|snapchat\.com|gettyimages\.|shutterstock\.|adobe\.stock|istockphoto\.|alamy\.com|dreamstime\.|depositphotos\.|123rf\.|media\.getty)/i;

const BLOCKED_PATH_RE =
  /lookaside|crawler\/media|profile_images|avatar|sprite|favicon|tracking|1x1|pixel\./i;

const DIRECT_IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)(?:$|\?)/i;

/** Known royalty-free / CC CDNs with stable direct image URLs. */
export const TRUSTED_FREE_HOST_RE =
  /(^|\.)(upload\.wikimedia\.org|commons\.wikimedia\.org|images\.unsplash\.com|plus\.unsplash\.com|images\.pexels\.com|images\.pixabay\.com|cdn\.pixabay\.com|live\.staticflickr\.com|farm\d*\.staticflickr\.com|staticflickr\.com|openverse\.org|wordpress\.com|wp\.com|raw\.githubusercontent\.com)/i;

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isBlockedImageUrl(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("/api/runs/")) return false;
  const host = hostnameOf(url);
  if (!host) return true;
  if (BLOCKED_HOST_RE.test(host)) return true;
  if (BLOCKED_PATH_RE.test(url)) return true;
  return false;
}

export function isTrustedFreeImageHost(url: string): boolean {
  if (url.startsWith("/api/runs/")) return true;
  return TRUSTED_FREE_HOST_RE.test(hostnameOf(url));
}

/** Direct, likely-renderable image URL (not an HTML page / social crawler endpoint). */
export function isDirectImageUrl(url: string): boolean {
  if (url.startsWith("/api/runs/")) return true;
  if (!isValidHttpUrl(url)) return false;
  if (url.toLowerCase().startsWith("data:")) return false;
  if (isBlockedImageUrl(url)) return false;
  if (isTrustedFreeImageHost(url)) return true;
  if (DIRECT_IMAGE_EXT_RE.test(url)) return true;
  return false;
}

export function extractMarkdownImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const re = new RegExp(MD_IMAGE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    const url = match[1]?.trim();
    if (!url) continue;
    if (url.startsWith("/api/runs/") || (isValidHttpUrl(url) && !isBlockedImageUrl(url))) {
      urls.push(url);
    }
  }
  return urls;
}

export function githubOpenGraphImage(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/^(www\.)?github\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `https://opengraph.githubassets.com/1/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

export function resolveFeaturedImage(input: {
  featuredImage?: string | null;
  content?: string;
  sourceUrls?: string[];
}): string | null {
  const explicit = input.featuredImage?.trim();
  if (explicit) {
    if (explicit.startsWith("/api/runs/")) return explicit;
    if (isValidHttpUrl(explicit) && !isBlockedImageUrl(explicit)) return explicit;
  }
  const fromBody = extractMarkdownImageUrls(input.content ?? "")[0];
  if (fromBody) return fromBody;
  for (const url of input.sourceUrls ?? []) {
    const og = githubOpenGraphImage(url);
    if (og) return og;
  }
  return null;
}
