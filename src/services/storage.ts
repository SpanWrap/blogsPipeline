import { appConfig } from "../config";
import { CachedRunStore } from "./cached-run-store";
import { FileRunStore } from "./file-store";
import { MongoRunStore } from "./mongo-store";
import type { RunStore } from "./store";

export type { RunStore } from "./store";
export { FileRunStore } from "./file-store";
export { MongoRunStore } from "./mongo-store";

let defaultStore: RunStore | null = null;

export function createRunStore(backend = appConfig.storage.backend): RunStore {
  if (backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) {
      throw new Error(
        process.env.VERCEL
          ? "Vercel deploys need MONGODB_URI (Atlas) or STORAGE_BACKEND=s3."
          : "STORAGE_BACKEND=mongodb requires MONGODB_URI (e.g. mongodb://127.0.0.1:27017)",
      );
    }
    return new MongoRunStore(
      uri,
      appConfig.storage.mongoDb,
      appConfig.storage.mongoCollection,
    );
  }
  const fileStore = new FileRunStore();
  // S3 (and local file) benefit from short TTL caching under poll load.
  return new CachedRunStore(fileStore);
}

/** Shared store for CLI and UI (lazily created). */
export function getRunStore(): RunStore {
  if (!defaultStore) {
    defaultStore = createRunStore();
  }
  return defaultStore;
}

/** @deprecated use getRunStore / createRunStore */
export const runStore = {
  save: (run: Parameters<RunStore["save"]>[0]) => getRunStore().save(run),
  get: (id: string) => getRunStore().get(id),
  require: (id: string) => getRunStore().require(id),
  delete: (id: string) => getRunStore().delete(id),
  list: () => getRunStore().list(),
};
