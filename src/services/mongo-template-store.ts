import { type Collection, type Document } from "mongodb";
import { appConfig } from "../config";
import { ArticleTemplate, ArticleTemplateSchema } from "../models";
import type { TemplateStore } from "./template-store";
import { connectMongo, formatMongoError } from "./mongo-connection";

export class MongoTemplateStore implements TemplateStore {
  private client: Awaited<ReturnType<typeof connectMongo>>["client"] | null = null;
  private collection: Collection<Document> | null = null;
  private connecting: Promise<Collection<Document>> | null = null;

  constructor(
    private readonly uri: string,
    private readonly dbName = appConfig.storage.mongoDb,
    private readonly collectionName = "article_templates",
  ) {}

  private async ensureConnected(): Promise<Collection<Document>> {
    if (this.collection) return this.collection;
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          const { client, db } = await connectMongo(this.uri, this.dbName);
          const col = db.collection(this.collectionName);
          await col.createIndex({ updatedAt: -1 });
          await col.createIndex({ name: 1 });
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

  private docToTemplate(doc: Document): ArticleTemplate {
    const raw = doc as unknown as Record<string, unknown>;
    const { _id, ...rest } = raw;
    return ArticleTemplateSchema.parse({ ...rest, id: String(_id) });
  }

  async save(template: ArticleTemplate): Promise<ArticleTemplate> {
    const parsed = ArticleTemplateSchema.parse({
      ...template,
      updatedAt: new Date().toISOString(),
    });
    const col = await this.ensureConnected();
    const doc = { ...parsed, _id: parsed.id } as unknown as Document;
    await col.replaceOne(this.filterById(parsed.id), doc, { upsert: true });
    return parsed;
  }

  async get(id: string): Promise<ArticleTemplate | null> {
    const col = await this.ensureConnected();
    const doc = await col.findOne(this.filterById(id));
    if (!doc) return null;
    return this.docToTemplate(doc);
  }

  async require(id: string): Promise<ArticleTemplate> {
    const t = await this.get(id);
    if (!t) throw new Error(`Template not found: ${id}`);
    return t;
  }

  async list(): Promise<ArticleTemplate[]> {
    const col = await this.ensureConnected();
    const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
    return docs.map((d) => this.docToTemplate(d));
  }

  async delete(id: string): Promise<boolean> {
    const col = await this.ensureConnected();
    const result = await col.deleteOne(this.filterById(id));
    return (result.deletedCount ?? 0) > 0;
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
