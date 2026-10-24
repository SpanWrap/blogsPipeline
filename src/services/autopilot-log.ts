import { type Collection, type Document } from "mongodb";
import { appConfig } from "../config";
import { connectMongo, formatMongoError } from "./mongo-connection";
import { createId } from "../utils/idempotency";
import { getDataFs, type DataFs } from "./data-fs";
import { logger } from "./logger";

/**
 * Record of a single pipeline run created during an autopilot cycle.
 */
export interface AutopilotRunRecord {
  runId: string;
  topic: string;
  platform: string;
  status: string;
  error?: string;
}

/**
 * Persistent log entry for one autopilot cycle execution.
 */
export type AutopilotEmailStatus = "pending" | "sent" | "failed" | "skipped";

/** Delivery record for the draft email of one cycle. Stored with the cycle. */
export interface AutopilotEmailDelivery {
  status: AutopilotEmailStatus;
  error?: string;
  messageId?: string;
  runId?: string;
  attempts: number;
  lastAttemptAt?: string;
  /** Failed sends stay queued until a retry succeeds or the attempt limit is reached. */
  queued: boolean;
  nextRetryAt?: string;
}

export interface AutopilotCycleLog {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  topicsDiscovered: number;
  topicsSelected: number;
  runsCreated: AutopilotRunRecord[];
  runsPublished: number;
  runsNeedingReview: number;
  errors: string[];
  email?: AutopilotEmailDelivery;
}

export interface AutopilotLogStore {
  create(log: AutopilotCycleLog): Promise<AutopilotCycleLog>;
  update(log: AutopilotCycleLog): Promise<AutopilotCycleLog>;
  get(id: string): Promise<AutopilotCycleLog | null>;
  list(limit?: number): Promise<AutopilotCycleLog[]>;
  latest(): Promise<AutopilotCycleLog | null>;
  close?(): Promise<void>;
}

// ── File-based store ──

export class FileAutopilotLogStore implements AutopilotLogStore {
  constructor(private readonly fs: DataFs = getDataFs()) {}

  private key(id: string) {
    return `autopilot/${id}.json`;
  }

  async create(log: AutopilotCycleLog): Promise<AutopilotCycleLog> {
    await this.fs.writeText(this.key(log.id), JSON.stringify(log, null, 2));
    return log;
  }

  async update(log: AutopilotCycleLog): Promise<AutopilotCycleLog> {
    return this.create(log);
  }

  async get(id: string): Promise<AutopilotCycleLog | null> {
    const raw = await this.fs.readText(this.key(id));
    if (!raw) return null;
    return JSON.parse(raw) as AutopilotCycleLog;
  }

  async list(limit = 20): Promise<AutopilotCycleLog[]> {
    const names = await this.fs.listNames("autopilot");
    const logs: AutopilotCycleLog[] = [];
    for (const file of names) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await this.fs.readText(`autopilot/${file}`);
        if (!raw) continue;
        logs.push(JSON.parse(raw) as AutopilotCycleLog);
      } catch {
        // skip corrupted files
      }
    }
    return logs
      .sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1))
      .slice(0, limit);
  }

  async latest(): Promise<AutopilotCycleLog | null> {
    const all = await this.list(1);
    return all[0] ?? null;
  }
}

// ── MongoDB store ──

export class MongoAutopilotLogStore implements AutopilotLogStore {
  private client: Awaited<ReturnType<typeof connectMongo>>["client"] | null = null;
  private collection: Collection<Document> | null = null;
  private connecting: Promise<Collection<Document>> | null = null;

  constructor(
    private readonly uri: string,
    private readonly dbName = appConfig.storage.mongoDb,
    private readonly collectionName = "autopilot_cycles",
  ) {}

  private async ensureConnected(): Promise<Collection<Document>> {
    if (this.collection) return this.collection;
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          const { client, db } = await connectMongo(this.uri, this.dbName);
          const col = db.collection(this.collectionName);
          await col.createIndex({ startedAt: -1 });
          this.client = client;
          this.collection = col;
          return col;
        } catch (error) {
          this.client = null;
          this.collection = null;
          this.connecting = null;
          throw error instanceof Error ? error : new Error(formatMongoError(error));
        }
      })();
    }
    return this.connecting;
  }

  async create(log: AutopilotCycleLog): Promise<AutopilotCycleLog> {
    const col = await this.ensureConnected();
    await col.insertOne({ ...log, _id: log.id as unknown as Document } as unknown as Document);
    return log;
  }

  async update(log: AutopilotCycleLog): Promise<AutopilotCycleLog> {
    const col = await this.ensureConnected();
    await col.replaceOne(
      { _id: log.id as unknown as Document },
      { ...log, _id: log.id as unknown as Document } as unknown as Document,
      { upsert: true },
    );
    return log;
  }

  async get(id: string): Promise<AutopilotCycleLog | null> {
    const col = await this.ensureConnected();
    const doc = await col.findOne({ _id: id as unknown as Document });
    if (!doc) return null;
    const { _id, ...rest } = doc as unknown as Record<string, unknown>;
    return { ...rest, id: String(_id) } as AutopilotCycleLog;
  }

  async list(limit = 20): Promise<AutopilotCycleLog[]> {
    const col = await this.ensureConnected();
    const docs = await col.find({}).sort({ startedAt: -1 }).limit(limit).toArray();
    return docs.map((d) => {
      const { _id, ...rest } = d as unknown as Record<string, unknown>;
      return { ...rest, id: String(_id) } as AutopilotCycleLog;
    });
  }

  async latest(): Promise<AutopilotCycleLog | null> {
    const all = await this.list(1);
    return all[0] ?? null;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.collection = null;
      this.connecting = null;
    }
  }
}

// ── Factory ──

let defaultStore: AutopilotLogStore | null = null;

export function createAutopilotLogStore(backend = appConfig.storage.backend): AutopilotLogStore {
  if (backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) throw new Error("MONGODB_URI required for autopilot log store");
    return new MongoAutopilotLogStore(uri);
  }
  return new FileAutopilotLogStore();
}

export function getAutopilotLogStore(): AutopilotLogStore {
  if (!defaultStore) defaultStore = createAutopilotLogStore();
  return defaultStore;
}

export function newCycleLog(): AutopilotCycleLog {
  return {
    id: createId("cycle"),
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    topicsDiscovered: 0,
    topicsSelected: 0,
    runsCreated: [],
    runsPublished: 0,
    runsNeedingReview: 0,
    errors: [],
  };
}
