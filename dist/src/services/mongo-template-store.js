import { appConfig } from "../config";
import { ArticleTemplateSchema } from "../models";
import { connectMongo, formatMongoError } from "./mongo-connection";
export class MongoTemplateStore {
    uri;
    dbName;
    collectionName;
    client = null;
    collection = null;
    connecting = null;
    constructor(uri, dbName = appConfig.storage.mongoDb, collectionName = "article_templates") {
        this.uri = uri;
        this.dbName = dbName;
        this.collectionName = collectionName;
    }
    async ensureConnected() {
        if (this.collection)
            return this.collection;
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
                }
                catch (error) {
                    this.client = null;
                    this.collection = null;
                    this.connecting = null;
                    throw error instanceof Error ? error : new Error(formatMongoError(error));
                }
            })();
        }
        return this.connecting;
    }
    filterById(id) {
        return { _id: id };
    }
    docToTemplate(doc) {
        const raw = doc;
        const { _id, ...rest } = raw;
        return ArticleTemplateSchema.parse({ ...rest, id: String(_id) });
    }
    async save(template) {
        const parsed = ArticleTemplateSchema.parse({
            ...template,
            updatedAt: new Date().toISOString(),
        });
        const col = await this.ensureConnected();
        const doc = { ...parsed, _id: parsed.id };
        await col.replaceOne(this.filterById(parsed.id), doc, { upsert: true });
        return parsed;
    }
    async get(id) {
        const col = await this.ensureConnected();
        const doc = await col.findOne(this.filterById(id));
        if (!doc)
            return null;
        return this.docToTemplate(doc);
    }
    async require(id) {
        const t = await this.get(id);
        if (!t)
            throw new Error(`Template not found: ${id}`);
        return t;
    }
    async list() {
        const col = await this.ensureConnected();
        const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
        return docs.map((d) => this.docToTemplate(d));
    }
    async delete(id) {
        const col = await this.ensureConnected();
        const result = await col.deleteOne(this.filterById(id));
        return (result.deletedCount ?? 0) > 0;
    }
    async close() {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.collection = null;
            this.connecting = null;
        }
    }
}
