import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../config";
import { TopicRecommendationSchema } from "../models";
import { connectMongo, formatMongoError } from "./mongo-connection";
export class FileTopicStore {
    rootDir;
    constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
    }
    dir() {
        return path.join(this.rootDir, "topics");
    }
    filePath(id) {
        return path.join(this.dir(), `${id}.json`);
    }
    async ensureReady() {
        await mkdir(this.dir(), { recursive: true });
    }
    async saveMany(topics) {
        await this.ensureReady();
        await this.clear();
        const saved = [];
        for (const t of topics) {
            const parsed = TopicRecommendationSchema.parse(t);
            await writeFile(this.filePath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
            saved.push(parsed);
        }
        return saved;
    }
    async list() {
        await this.ensureReady();
        const files = await readdir(this.dir());
        const out = [];
        for (const file of files) {
            if (!file.endsWith(".json"))
                continue;
            const raw = await readFile(path.join(this.dir(), file), "utf8");
            out.push(TopicRecommendationSchema.parse(JSON.parse(raw)));
        }
        return out.sort((a, b) => b.heatScore - a.heatScore);
    }
    async get(id) {
        try {
            const raw = await readFile(this.filePath(id), "utf8");
            return TopicRecommendationSchema.parse(JSON.parse(raw));
        }
        catch (error) {
            if (error.code === "ENOENT")
                return null;
            throw error;
        }
    }
    async require(id) {
        const t = await this.get(id);
        if (!t)
            throw new Error(`Topic recommendation not found: ${id}`);
        return t;
    }
    async clear() {
        await this.ensureReady();
        const files = await readdir(this.dir());
        await Promise.all(files
            .filter((f) => f.endsWith(".json"))
            .map((f) => unlink(path.join(this.dir(), f)).catch(() => undefined)));
    }
}
export class MongoTopicStore {
    uri;
    dbName;
    collectionName;
    client = null;
    collection = null;
    connecting = null;
    constructor(uri, dbName = appConfig.storage.mongoDb, collectionName = "topic_recommendations") {
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
                    await col.createIndex({ heatScore: -1 });
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
    toTopic(doc) {
        const raw = doc;
        const { _id, ...rest } = raw;
        return TopicRecommendationSchema.parse({ ...rest, id: String(_id) });
    }
    async saveMany(topics) {
        const col = await this.ensureConnected();
        await col.deleteMany({});
        if (!topics.length)
            return [];
        const docs = topics.map((t) => {
            const parsed = TopicRecommendationSchema.parse(t);
            return { ...parsed, _id: parsed.id };
        });
        await col.insertMany(docs);
        return topics.map((t) => TopicRecommendationSchema.parse(t));
    }
    async list() {
        const col = await this.ensureConnected();
        const docs = await col.find({}).sort({ heatScore: -1 }).toArray();
        return docs.map((d) => this.toTopic(d));
    }
    async get(id) {
        const col = await this.ensureConnected();
        const doc = await col.findOne(this.filterById(id));
        if (!doc)
            return null;
        return this.toTopic(doc);
    }
    async require(id) {
        const t = await this.get(id);
        if (!t)
            throw new Error(`Topic recommendation not found: ${id}`);
        return t;
    }
    async clear() {
        const col = await this.ensureConnected();
        await col.deleteMany({});
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
let defaultTopicStore = null;
export function createTopicStore(backend = appConfig.storage.backend) {
    if (backend === "mongodb") {
        const uri = appConfig.storage.mongoUri;
        if (!uri)
            throw new Error("MONGODB_URI required for topic store");
        return new MongoTopicStore(uri);
    }
    return new FileTopicStore(appConfig.dataDir);
}
export function getTopicStore() {
    if (!defaultTopicStore)
        defaultTopicStore = createTopicStore();
    return defaultTopicStore;
}
/** Reset singleton (e.g. after config change in tests). */
export function resetTopicStore() {
    defaultTopicStore = null;
}
