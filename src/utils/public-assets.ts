import { appConfig } from "../config";

const RUN_IMAGE_PATH_RE = /^\/api\/runs\/([^/]+)\/images\/([^/?#]+)$/i;
const RUN_IMAGE_IN_TEXT_RE = /(?:https?:\/\/[^/\s)]+)?(\/api\/runs\/[^)\s]+)/gi;

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Relative app path for a saved run image (works in the review UI).
 */
export function relativeRunImagePath(runId: string, filename: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/images/${encodeURIComponent(filename)}`;
}

/**
 * Public absolute URL for a saved run image.
 * Prefers AWS_S3_PUBLIC_BASE_URL when set; otherwise PIPELINE_PUBLIC_URL + /api/runs/...
 */
export function absoluteRunImageUrl(runId: string, filename: string): string {
  const s3Base = appConfig.storage.s3.publicBaseUrl;
  if (s3Base) {
    const prefix = appConfig.storage.s3.prefix;
    const key = [prefix, "images", runId, filename].filter(Boolean).join("/");
    return joinUrl(s3Base, key);
  }
  return joinUrl(appConfig.publicUrl, relativeRunImagePath(runId, filename));
}

/**
 * Turn a relative `/api/runs/.../images/...` (or already-absolute pipeline URL)
 * into a publicly fetchable URL for external publishers.
 */
export function toPublicAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Already absolute non-pipeline URL (Unsplash, GitHub OG, etc.) — keep.
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const pathMatch = parsed.pathname.match(RUN_IMAGE_PATH_RE);
      if (!pathMatch) return trimmed;
      // Absolute but pointing at /api/runs — rebuild via preferred public base (S3 or PIPELINE_PUBLIC_URL).
      return absoluteRunImageUrl(
        decodeURIComponent(pathMatch[1]!),
        decodeURIComponent(pathMatch[2]!),
      );
    } catch {
      return trimmed;
    }
  }

  const rel = trimmed.match(RUN_IMAGE_PATH_RE);
  if (rel) {
    return absoluteRunImageUrl(decodeURIComponent(rel[1]!), decodeURIComponent(rel[2]!));
  }

  // Other relative paths — prefix with pipeline public origin.
  if (trimmed.startsWith("/")) {
    return joinUrl(appConfig.publicUrl, trimmed);
  }

  return trimmed;
}

/** Rewrite markdown/HTML image references that use relative /api/runs/... paths. */
export function rewriteAssetUrlsForPublish(text: string): string {
  if (!text) return text;
  return text.replace(RUN_IMAGE_IN_TEXT_RE, (full, pathPart: string) => {
    const absolute = toPublicAssetUrl(pathPart);
    return absolute || full;
  });
}
