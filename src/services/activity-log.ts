import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Collection, Document } from "mongodb";
import path from "node:path";
import { appConfig } from "../config";
import { createId } from "../utils/idempotency";
import { connectMongo } from "./mongo-connection";

export type ActivityEntry = {
  id: string;
  at: string;
  username: string | null;
  action: string;
  method: string;
  path: string;
  details?: Record<string, unknown>;
  ip?: string;
};

export type ActivityLogStore = {
  append(entry: Omit<ActivityEntry, "id" | "at"> & { at?: string }): Promise<ActivityEntry>;
  list(limit?: number): Promise<ActivityEntry[]>;
};

const MAX_FILE_ENTRIES = 2000;

function parseEntry(raw: unknown): ActivityEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || typeof rec.at !== "string" || typeof rec.action !== "string") {
    return null;
  }
  return {
    id: rec.id,
    at: rec.at,
    username: typeof rec.username === "string" ? rec.username : null,
    action: rec.action,
    method: typeof rec.method === "string" ? rec.method : "",
    path: typeof rec.path === "string" ? rec.path : "",
    details:
      rec.details && typeof rec.details === "object" && !Array.isArray(rec.details)
        ? (rec.details as Record<string, unknown>)
        : undefined,
    ip: typeof rec.ip === "string" ? rec.ip : undefined,
  };
}

export class FileActivityLogStore implements ActivityLogStore {
  constructor(private readonly rootDir = appConfig.dataDir) {}

  private filePath() {
    return path.join(this.rootDir, "activity-log.json");
  }

  private readAll(): ActivityEntry[] {
    try {
      const raw = JSON.parse(readFileSync(this.filePath(), "utf8")) as { entries?: unknown };
      if (!Array.isArray(raw.entries)) return [];
      return raw.entries.map(parseEntry).filter((e): e is ActivityEntry => Boolean(e));
    } catch {
      return [];
    }
  }

  async append(input: Omit<ActivityEntry, "id" | "at"> & { at?: string }): Promise<ActivityEntry> {
    const entry: ActivityEntry = {
      id: createId("log"),
      at: input.at ?? new Date().toISOString(),
      username: input.username,
      action: input.action,
      method: input.method,
      path: input.path,
      details: input.details,
      ip: input.ip,
    };
    const entries = [entry, ...this.readAll()].slice(0, MAX_FILE_ENTRIES);
    mkdirSync(this.rootDir, { recursive: true });
    writeFileSync(this.filePath(), JSON.stringify({ entries }, null, 2), "utf8");
    return entry;
  }

  async list(limit = 100): Promise<ActivityEntry[]> {
    return this.readAll().slice(0, Math.min(Math.max(limit, 1), 500));
  }
}

export class MongoActivityLogStore implements ActivityLogStore {
  private collection: Collection<Document> | null = null;

  constructor(
    private readonly uri: string,
    private readonly dbName: string,
  ) {}

  private async col(): Promise<Collection<Document>> {
    if (this.collection) return this.collection;
    const { db } = await connectMongo(this.uri, this.dbName);
    const col = db.collection("activity_logs");
    await col.createIndex({ at: -1 });
    this.collection = col;
    return col;
  }

  async append(input: Omit<ActivityEntry, "id" | "at"> & { at?: string }): Promise<ActivityEntry> {
    const entry: ActivityEntry = {
      id: createId("log"),
      at: input.at ?? new Date().toISOString(),
      username: input.username,
      action: input.action,
      method: input.method,
      path: input.path,
      details: input.details,
      ip: input.ip,
    };
    const col = await this.col();
    await col.insertOne({ ...entry, _id: entry.id } as unknown as Document);
    return entry;
  }

  async list(limit = 100): Promise<ActivityEntry[]> {
    const col = await this.col();
    const docs = await col
      .find({})
      .sort({ at: -1 })
      .limit(Math.min(Math.max(limit, 1), 500))
      .toArray();
    return docs.map((d) => parseEntry({ ...d, id: String((d as { id?: string; _id?: unknown }).id ?? d._id) })).filter(
      (e): e is ActivityEntry => Boolean(e),
    );
  }
}

let defaultStore: ActivityLogStore | null = null;

export function createActivityLogStore(): ActivityLogStore {
  if (appConfig.storage.backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI");
    return new MongoActivityLogStore(uri, appConfig.storage.mongoDb);
  }
  return new FileActivityLogStore(appConfig.dataDir);
}

export function getActivityLogStore(): ActivityLogStore {
  if (!defaultStore) defaultStore = createActivityLogStore();
  return defaultStore;
}

export function resetActivityLogStoreCache() {
  defaultStore = null;
}

export async function recordActivity(
  input: Omit<ActivityEntry, "id" | "at"> & { at?: string },
): Promise<void> {
  try {
    await getActivityLogStore().append(input);
  } catch {
    // never fail the user request because logging failed
  }
}
