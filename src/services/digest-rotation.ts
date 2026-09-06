import { getDataFs } from "./data-fs";

const MAX_SHOWN = 160;
const KEY = "digest-shown-urls.json";

type ShownState = {
  urls: string[];
  updatedAt?: string;
};

let memoryUrls: string[] | null = null;

export async function getShownDigestUrls(): Promise<string[]> {
  if (memoryUrls) return memoryUrls;
  try {
    const raw = await getDataFs().readText(KEY);
    if (!raw) {
      memoryUrls = [];
      return memoryUrls;
    }
    const parsed = JSON.parse(raw) as ShownState;
    memoryUrls = Array.isArray(parsed.urls) ? parsed.urls.filter((u) => typeof u === "string") : [];
  } catch {
    memoryUrls = [];
  }
  return memoryUrls;
}

export async function rememberShownDigestUrls(urls: string[]): Promise<void> {
  const uniqueNew = [...new Set(urls.filter(Boolean))];
  if (!uniqueNew.length) return;
  const prev = await getShownDigestUrls();
  const next = [...uniqueNew, ...prev.filter((u) => !uniqueNew.includes(u))].slice(0, MAX_SHOWN);
  await persistShownUrls(next);
}

export async function replaceShownDigestUrls(urls: string[]): Promise<void> {
  const next = [...new Set(urls.filter(Boolean))].slice(0, MAX_SHOWN);
  await persistShownUrls(next);
}

async function persistShownUrls(urls: string[]): Promise<void> {
  memoryUrls = urls;
  try {
    const payload: ShownState = { urls, updatedAt: new Date().toISOString() };
    await getDataFs().writeText(KEY, JSON.stringify(payload, null, 2));
  } catch {
    // Ephemeral FS / transient S3 errors — memory rotation still works for this process.
  }
}

/** Prefer URLs not recently shown. If everything was shown, reset and reuse the pool. */
export function pickRotatedItems<T extends { url: string }>(
  items: T[],
  shown: string[],
  limit: number,
): { picked: T[]; exhausted: boolean } {
  if (!items.length || limit <= 0) return { picked: [], exhausted: false };
  const shownSet = new Set(shown);
  const fresh = items.filter((item) => item.url && !shownSet.has(item.url));
  const repeats = items.filter((item) => item.url && shownSet.has(item.url));
  if (!fresh.length) {
    return { picked: items.slice(0, limit), exhausted: true };
  }
  return { picked: [...fresh, ...repeats].slice(0, limit), exhausted: false };
}

/** Drop URLs that belong to the current candidate pool so the next refresh can cycle. */
export function dropShownUrlsInPool(shown: string[], poolUrls: string[]): string[] {
  const pool = new Set(poolUrls);
  return shown.filter((url) => !pool.has(url));
}
