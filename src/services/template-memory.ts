import { getDataFs, usesS3Storage } from "./data-fs";

export type TemplateMemory = {
  lastTemplateId: string | null;
  lastStylePresetId: string | null;
  updatedAt: string;
};

const KEY = "template-memory.json";

let cache: TemplateMemory | null = null;

function emptyMemory(): TemplateMemory {
  return { lastTemplateId: null, lastStylePresetId: null, updatedAt: new Date().toISOString() };
}

function parseMemory(raw: string): TemplateMemory {
  const data = JSON.parse(raw) as Partial<TemplateMemory>;
  return {
    lastTemplateId: data.lastTemplateId ?? null,
    lastStylePresetId: data.lastStylePresetId ?? null,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

/** Sync read — uses in-memory cache; call ensureTemplateMemory() first when using S3. */
export function loadTemplateMemory(): TemplateMemory {
  if (cache) return cache;
  if (usesS3Storage()) return emptyMemory();
  // Local fallback for sync callers before ensureTemplateMemory.
  return emptyMemory();
}

export async function ensureTemplateMemory(): Promise<TemplateMemory> {
  if (cache) return cache;
  try {
    const raw = await getDataFs().readText(KEY);
    cache = raw ? parseMemory(raw) : emptyMemory();
  } catch {
    cache = emptyMemory();
  }
  return cache;
}

export async function saveTemplateMemory(partial: Partial<TemplateMemory>): Promise<TemplateMemory> {
  const prev = await ensureTemplateMemory();
  const next: TemplateMemory = {
    lastTemplateId: partial.lastTemplateId !== undefined ? partial.lastTemplateId : prev.lastTemplateId,
    lastStylePresetId:
      partial.lastStylePresetId !== undefined ? partial.lastStylePresetId : prev.lastStylePresetId,
    updatedAt: new Date().toISOString(),
  };
  cache = next;
  await getDataFs().writeText(KEY, JSON.stringify(next, null, 2));
  return next;
}

/** Test helper */
export function resetTemplateMemoryCache(): void {
  cache = null;
}
