import { appConfig } from "../config";
import { FileRunStore } from "./file-store";
import { MongoRunStore } from "./mongo-store";
export { FileRunStore } from "./file-store";
export { MongoRunStore } from "./mongo-store";
let defaultStore = null;
export function createRunStore(backend = appConfig.storage.backend) {
    if (backend === "mongodb") {
        const uri = appConfig.storage.mongoUri;
        if (!uri) {
            throw new Error(process.env.VERCEL
                ? "Vercel deploys need MONGODB_URI (Atlas). File storage is ephemeral on serverless."
                : "STORAGE_BACKEND=mongodb requires MONGODB_URI (e.g. mongodb://127.0.0.1:27017)");
        }
        return new MongoRunStore(uri, appConfig.storage.mongoDb, appConfig.storage.mongoCollection);
    }
    return new FileRunStore(appConfig.dataDir);
}
/** Shared store for CLI and UI (lazily created). */
export function getRunStore() {
    if (!defaultStore) {
        defaultStore = createRunStore();
    }
    return defaultStore;
}
/** @deprecated use getRunStore / createRunStore */
export const runStore = {
    save: (run) => getRunStore().save(run),
    get: (id) => getRunStore().get(id),
    require: (id) => getRunStore().require(id),
    delete: (id) => getRunStore().delete(id),
    list: () => getRunStore().list(),
};
