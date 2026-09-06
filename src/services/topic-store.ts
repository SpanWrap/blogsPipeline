import { type Collection, type Document } from "mongodb";
import { appConfig } from "../config";
import { TopicRecommendation, TopicRecommendationSchema } from "../models";
import { getDataFs, LocalDataFs, type DataFs } from "./data-fs";
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
  private readonly fs: DataFs;

  constructor(fsOrRoot: DataFs | string = getDataFs()) {
    this.fs = typeof fsOrRoot === "string" ? new LocalDataFs(fsOrRoot) : fsOrRoot;
  }

  private key(id: string) {
    return `topics/${id}.json`;
  }

  async saveMany(topics: TopicRecommendation[]): Promise<TopicRecommendation[]> {
    await this.clear();
    const saved: TopicRecommendation[] = [];
    for (const t of topics) {
      const parsed = TopicRecommendationSchema.parse(t);
      await this.fs.writeText(this.key(parsed.id), JSON.stringify(parsed, null, 2));
      saved.push(parsed);
    }
    return saved;
  }

  async list(): Promise<TopicRecommendation[]> {
    const names = await this.fs.listNames("topics");
    const out: TopicRecommendation[] = [];
    for (const file of names) {
      if (!file.endsWith(".json")) continue;
      const raw = await this.fs.readText(`topics/${file}`);
      if (!raw) continue;
      out.push(TopicRecommendationSchema.parse(JSON.parse(raw)));
    }
    return out.sort((a, b) => b.heatScore - a.heatScore);
  }

  async get(id: string): Promise<TopicRecommendation | null> {
    const raw = await this.fs.readText(this.key(id));
    if (!raw) return null;
    return TopicRecommendationSchema.parse(JSON.parse(raw));
  }

  async require(id: string): Promise<TopicRecommendation> {
    const t = await this.get(id);
    if (!t) throw new Error(`Topic recommendation not found: ${id}`);
    return t;
  }

  async clear(): Promise<void> {
    const names = await this.fs.listNames("topics");
    await Promise.all(
      names
        .filter((f) => f.endsWith(".json"))
        .map((f) => this.fs.delete(`topics/${f}`).catch(() => false)),
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
  return new FileTopicStore();
}

export function getTopicStore(): TopicStore {
  if (!defaultTopicStore) defaultTopicStore = createTopicStore();
  return defaultTopicStore;
}

/** Reset singleton (e.g. after config change in tests). */
export function resetTopicStore(): void {
  defaultTopicStore = null;
}
