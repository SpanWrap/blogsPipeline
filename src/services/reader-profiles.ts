import type { Collection, Document } from "mongodb";
import { appConfig } from "../config";
import { getDataFs } from "./data-fs";
import { connectMongo } from "./mongo-connection";

export type ReaderProfile = {
  id: string;
  label: string;
  audience: string;
  seniority: string;
  stack: string;
  goal: string;
};

export type ReaderProfileSettings = {
  profiles: ReaderProfile[];
  defaultProfileId: string;
  updatedAt: string;
};

const SETTINGS_KEY = "reader-profiles.json";
const SETTINGS_ID = "current";

let cache: ReaderProfileSettings | null = null;
let loaded = false;
let mongoCol: Collection<Document> | null = null;

export const DEFAULT_READER_PROFILES: ReaderProfile[] = [
  {
    id: "senior-backend",
    label: "Senior backend engineers",
    audience: "senior backend engineers",
    seniority: "senior",
    stack: "APIs, databases, and distributed systems",
    goal: "practical implementation guidance they can apply at work",
  },
  {
    id: "founders",
    label: "Founders evaluating AI tools",
    audience: "founders evaluating AI tools",
    seniority: "founder",
    stack: "product and AI tooling",
    goal: "decide what is worth adopting",
  },
  {
    id: "devops",
    label: "DevOps engineers on call",
    audience: "DevOps engineers on call",
    seniority: "mid to senior",
    stack: "infrastructure, reliability, and deployment",
    goal: "operational how-to they can use during an incident",
  },
];

export function readerSummary(profile: ReaderProfile): string {
  return [
    profile.audience.trim(),
    profile.seniority.trim() ? `Seniority: ${profile.seniority.trim()}` : "",
    profile.stack.trim() ? `Stack: ${profile.stack.trim()}` : "",
    profile.goal.trim() ? `They want: ${profile.goal.trim()}` : "",
  ]
    .filter(Boolean)
    .join(". ");
}

function defaultSettings(): ReaderProfileSettings {
  return {
    profiles: DEFAULT_READER_PROFILES.map((profile) => ({ ...profile })),
    defaultProfileId: DEFAULT_READER_PROFILES[0]!.id,
    updatedAt: new Date(0).toISOString(),
  };
}

function slugId(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `reader-${Math.random().toString(36).slice(2, 8)}`;
}

function parseProfile(raw: unknown, index: number): ReaderProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const label = String(obj.label ?? "").trim();
  const audience = String(obj.audience ?? "").trim();
  if (!label || !audience) return null;
  const id = slugId(String(obj.id ?? label)) || `reader-${index + 1}`;
  return {
    id,
    label,
    audience,
    seniority: String(obj.seniority ?? "").trim(),
    stack: String(obj.stack ?? "").trim(),
    goal: String(obj.goal ?? "").trim(),
  };
}

function parseStored(raw: unknown): ReaderProfileSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const profiles = Array.isArray(obj.profiles)
    ? obj.profiles
        .map((item, index) => parseProfile(item, index))
        .filter((item): item is ReaderProfile => Boolean(item))
    : [];
  if (!profiles.length) return null;
  const ids = new Set<string>();
  const unique: ReaderProfile[] = [];
  for (const profile of profiles) {
    let id = profile.id;
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    unique.push({ ...profile, id });
  }
  const requested = String(obj.defaultProfileId ?? "");
  return {
    profiles: unique,
    defaultProfileId: ids.has(requested) ? requested : unique[0]!.id,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
  };
}

async function readerSettingsCollection(): Promise<Collection<Document> | null> {
  if (appConfig.storage.backend !== "mongodb" || !appConfig.storage.mongoUri) return null;
  if (mongoCol) return mongoCol;
  const { db } = await connectMongo(appConfig.storage.mongoUri, appConfig.storage.mongoDb);
  mongoCol = db.collection("reader_profiles");
  return mongoCol;
}

async function loadStored(): Promise<ReaderProfileSettings | null> {
  try {
    const col = await readerSettingsCollection();
    if (col) {
      const doc = await col.findOne({ _id: SETTINGS_ID as unknown as Document["_id"] });
      if (doc) return parseStored(doc);
    }
  } catch {
    /* fall through to file */
  }
  try {
    const raw = await getDataFs().readText(SETTINGS_KEY);
    if (!raw) return null;
    return parseStored(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeStored(settings: ReaderProfileSettings): Promise<void> {
  const col = await readerSettingsCollection();
  if (col) {
    await col.updateOne(
      { _id: SETTINGS_ID as unknown as Document["_id"] },
      { $set: { ...settings, _id: SETTINGS_ID } },
      { upsert: true },
    );
    return;
  }
  await getDataFs().writeText(SETTINGS_KEY, JSON.stringify(settings, null, 2));
}

export async function getReaderProfileSettings(): Promise<ReaderProfileSettings> {
  if (loaded && cache) return cache;
  cache = (await loadStored()) ?? defaultSettings();
  loaded = true;
  return cache;
}

export function activeReaderProfile(settings: ReaderProfileSettings): ReaderProfile {
  return (
    settings.profiles.find((profile) => profile.id === settings.defaultProfileId) ??
    settings.profiles[0]!
  );
}

export async function saveReaderProfileSettings(input: {
  profiles?: unknown;
  defaultProfileId?: unknown;
}): Promise<ReaderProfileSettings> {
  const current = await getReaderProfileSettings();
  const parsed =
    input.profiles !== undefined
      ? parseStored({
          profiles: input.profiles,
          defaultProfileId: input.defaultProfileId ?? current.defaultProfileId,
        })
      : null;
  const next: ReaderProfileSettings = parsed
    ? { ...parsed, updatedAt: new Date().toISOString() }
    : {
        ...current,
        defaultProfileId:
          typeof input.defaultProfileId === "string" &&
          current.profiles.some((profile) => profile.id === input.defaultProfileId)
            ? input.defaultProfileId
            : current.defaultProfileId,
        updatedAt: new Date().toISOString(),
      };
  await writeStored(next);
  cache = next;
  loaded = true;
  return next;
}

export function publicReaderProfiles(settings: ReaderProfileSettings) {
  const active = activeReaderProfile(settings);
  return {
    profiles: settings.profiles.map((profile) => ({
      ...profile,
      summary: readerSummary(profile),
    })),
    defaultProfileId: settings.defaultProfileId,
    activeLabel: active.label,
    activeSummary: readerSummary(active),
    updatedAt: settings.updatedAt,
  };
}

export function resetReaderProfileCache(): void {
  cache = null;
  loaded = false;
  mongoCol = null;
}
