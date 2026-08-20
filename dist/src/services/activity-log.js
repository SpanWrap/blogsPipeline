import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appConfig } from "../config";
import { createId } from "../utils/idempotency";
import { connectMongo } from "./mongo-connection";
const MAX_FILE_ENTRIES = 2000;
function parseEntry(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const rec = raw;
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
        details: rec.details && typeof rec.details === "object" && !Array.isArray(rec.details)
            ? rec.details
            : undefined,
        ip: typeof rec.ip === "string" ? rec.ip : undefined,
    };
}
export class FileActivityLogStore {
    rootDir;
    constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
    }
    filePath() {
        return path.join(this.rootDir, "activity-log.json");
    }
    readAll() {
        try {
            const raw = JSON.parse(readFileSync(this.filePath(), "utf8"));
            if (!Array.isArray(raw.entries))
                return [];
            return raw.entries.map(parseEntry).filter((e) => Boolean(e));
        }
        catch {
            return [];
        }
    }
    async append(input) {
        const entry = {
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
    async list(limit = 100) {
        return this.readAll().slice(0, Math.min(Math.max(limit, 1), 500));
    }
}
export class MongoActivityLogStore {
    uri;
    dbName;
    collection = null;
    constructor(uri, dbName) {
        this.uri = uri;
        this.dbName = dbName;
    }
    async col() {
        if (this.collection)
            return this.collection;
        const { db } = await connectMongo(this.uri, this.dbName);
        const col = db.collection("activity_logs");
        await col.createIndex({ at: -1 });
        this.collection = col;
        return col;
    }
    async append(input) {
        const entry = {
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
        await col.insertOne({ ...entry, _id: entry.id });
        return entry;
    }
    async list(limit = 100) {
        const col = await this.col();
        const docs = await col
            .find({})
            .sort({ at: -1 })
            .limit(Math.min(Math.max(limit, 1), 500))
            .toArray();
        return docs.map((d) => parseEntry({ ...d, id: String(d.id ?? d._id) })).filter((e) => Boolean(e));
    }
}
let defaultStore = null;
export function createActivityLogStore() {
    if (appConfig.storage.backend === "mongodb") {
        const uri = appConfig.storage.mongoUri;
        if (!uri)
            throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI");
        return new MongoActivityLogStore(uri, appConfig.storage.mongoDb);
    }
    return new FileActivityLogStore(appConfig.dataDir);
}
export function getActivityLogStore() {
    if (!defaultStore)
        defaultStore = createActivityLogStore();
    return defaultStore;
}
export function resetActivityLogStoreCache() {
    defaultStore = null;
}
export async function recordActivity(input) {
    try {
        await getActivityLogStore().append(input);
    }
    catch {
        // never fail the user request because logging failed
    }
}
