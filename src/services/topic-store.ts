import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Collection, type Document } from "mongodb";
import { appConfig } from "../config";
import { TopicRecommendation, TopicRecommendationSchema } from "../models";
import { connectMongo, formatMongoError } from "./mongo-connection";

export interface TopicStore {
  saveMany(topics: TopicRecommendation[]): Promise<TopicRecommendation[]>;
  list(): Promise<TopicRecommendation[]>;
  get(id: string): Promise<TopicRecommendation | null>;
  require(id: string): Promise<TopicRecommendation>;
  clear(): Promise<void>;
  close?(): Promise<void>;
}

export class FileTopicStore implements TopicStore {
  constructor(private readonly rootDir = appConfig.dataDir) {}

  private dir() {
    return path.join(this.rootDir, "topics");
  }

  private filePath(id: string) {
    return path.join(this.dir(), `${id}.json`);
  }

  private async ensureReady() {
    await mkdir(this.dir(), { recursive: true });
  }

  async saveMany(topics: TopicRecommendation[]): Promise<TopicRecommendation[]> {
    await this.ensureReady();
    await this.clear();
    const saved: TopicRecommendation[] = [];
    for (const t of topics) {
      const parsed = TopicRecommendationSchema.parse(t);
      await writeFile(this.filePath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
      saved.push(parsed);
    }
    return saved;
  }

  async list(): Promise<TopicRecommendation[]> {
    await this.ensureReady();
    const files = await readdir(this.dir());
    const out: TopicRecommendation[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await readFile(path.join(this.dir(), file), "utf8");
      out.push(TopicRecommendationSchema.parse(JSON.parse(raw)));
    }
    return out.sort((a, b) => b.heatScore - a.heatScore);
  }

  async get(id: string): Promise<TopicRecommendation | null> {
    try {
      const raw = await readFile(this.filePath(id), "utf8");
      return TopicRecommendationSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async require(id: string): Promise<TopicRecommendation> {
    const t = await this.get(id);
    if (!t) throw new Error(`Topic recommendation not found: ${id}`);
    return t;
  }

  async clear(): Promise<void> {
    await this.ensureReady();
    const files = await readdir(this.dir());
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => unlink(path.join(this.dir(), f)).catch(() => undefined)),
    );
  }
}

export class MongoTopicStore implements TopicStore {
  private client: Awaited<ReturnType<typeof connectMongo>>["client"] | null = null;
  private collection: Collection<Document> | null = null;
  private connecting: Promise<Collection<Document>> | null = null;

  constructor(
    private readonly uri: string,
    private readonly dbName = appConfig.storage.mongoDb,
    private readonly collectionName = "topic_recommendations",
  ) {}

  private async ensureConnected(): Promise<Collection<Document>> {
    if (this.collection) return this.collection;
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          const { client, db } = await connectMongo(this.uri, this.dbName);
          const col = db.collection(this.collectionName);
          await col.createIndex({ heatScore: -1 });
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

  private filterById(id: string): Document {
    return { _id: id as unknown as Document };
  }

  private toTopic(doc: Document): TopicRecommendation {
    const raw = doc as unknown as Record<string, unknown>;
    const { _id, ...rest } = raw;
    return TopicRecommendationSchema.parse({ ...rest, id: String(_id) });
  }

  async saveMany(topics: TopicRecommendation[]): Promise<TopicRecommendation[]> {
    const col = await this.ensureConnected();
    await col.deleteMany({});
    if (!topics.length) return [];
    const docs = topics.map((t) => {
      const parsed = TopicRecommendationSchema.parse(t);
      return { ...parsed, _id: parsed.id } as unknown as Document;
    });
    await col.insertMany(docs);
    return topics.map((t) => TopicRecommendationSchema.parse(t));
  }

  async list(): Promise<TopicRecommendation[]> {
    const col = await this.ensureConnected();
    const docs = await col.find({}).sort({ heatScore: -1 }).toArray();
    return docs.map((d) => this.toTopic(d));
  }

  async get(id: string): Promise<TopicRecommendation | null> {
    const col = await this.ensureConnected();
    const doc = await col.findOne(this.filterById(id));
    if (!doc) return null;
    return this.toTopic(doc);
  }

  async require(id: string): Promise<TopicRecommendation> {
    const t = await this.get(id);
    if (!t) throw new Error(`Topic recommendation not found: ${id}`);
    return t;
  }

  async clear(): Promise<void> {
    const col = await this.ensureConnected();
    await col.deleteMany({});
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

let defaultTopicStore: TopicStore | null = null;

export function createTopicStore(backend = appConfig.storage.backend): TopicStore {
  if (backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) throw new Error("MONGODB_URI required for topic store");
    return new MongoTopicStore(uri);
  }
  return new FileTopicStore(appConfig.dataDir);
}

export function getTopicStore(): TopicStore {
  if (!defaultTopicStore) defaultTopicStore = createTopicStore();
  return defaultTopicStore;
}

/** Reset singleton (e.g. after config change in tests). */
export function resetTopicStore(): void {
  defaultTopicStore = null;
}
