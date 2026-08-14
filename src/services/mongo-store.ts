import { type Collection, type Document } from "mongodb";
import { PipelineRun, PipelineRunSchema } from "../models";
import type { RunStore } from "./store";
import { connectMongo, formatMongoError } from "./mongo-connection";

/** Runs are stored with string `_id` matching pipeline run id. */
export class MongoRunStore implements RunStore {
  private client: Awaited<ReturnType<typeof connectMongo>>["client"] | null = null;
  private collection: Collection<Document> | null = null;
  private connecting: Promise<Collection<Document>> | null = null;

  constructor(
    private readonly uri: string,
    private readonly dbName = "spanwrap_pipeline",
    private readonly collectionName = "pipeline_runs",
  ) {}

  private async ensureConnected(): Promise<Collection<Document>> {
    if (this.collection) return this.collection;
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          const { client, db } = await connectMongo(this.uri, this.dbName);
          const col = db.collection(this.collectionName);
          await col.createIndex({ updatedAt: -1 });
          await col.createIndex({ status: 1 });
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

  private docToRun(doc: Document): PipelineRun {
    const raw = doc as unknown as Record<string, unknown>;
    const { _id, ...rest } = raw;
    return PipelineRunSchema.parse({ ...rest, id: String(_id) });
  }

  async save(run: PipelineRun): Promise<PipelineRun> {
    const parsed = PipelineRunSchema.parse({
      ...run,
      updatedAt: new Date().toISOString(),
    });
    const col = await this.ensureConnected();
    const doc = {
      ...parsed,
      _id: parsed.id,
    } as unknown as Document;
    await col.replaceOne(this.filterById(parsed.id), doc, { upsert: true });
    return parsed;
  }

  async get(id: string): Promise<PipelineRun | null> {
    const col = await this.ensureConnected();
    const doc = await col.findOne(this.filterById(id));
    if (!doc) return null;
    return this.docToRun(doc);
  }

  async require(id: string): Promise<PipelineRun> {
    const run = await this.get(id);
    if (!run) throw new Error(`Pipeline run not found: ${id}`);
    return run;
  }

  async list(): Promise<PipelineRun[]> {
    const col = await this.ensureConnected();
    const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
    return docs.map((doc) => this.docToRun(doc));
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
