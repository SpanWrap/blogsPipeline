import { appConfig } from "../config";
import { ArticleTemplateSchema } from "../models";
import { createId } from "../utils/idempotency";
import { FileTemplateStore } from "./file-template-store";
import { MongoTemplateStore } from "./mongo-template-store";
export { FileTemplateStore } from "./file-template-store";
export { MongoTemplateStore } from "./mongo-template-store";
let defaultTemplateStore = null;
export function createTemplateStore(backend = appConfig.storage.backend) {
    if (backend === "mongodb") {
        const uri = appConfig.storage.mongoUri;
        if (!uri) {
            throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI for templates");
        }
        return new MongoTemplateStore(uri, appConfig.storage.mongoDb, "article_templates");
    }
    return new FileTemplateStore(appConfig.dataDir);
}
export function getTemplateStore() {
    if (!defaultTemplateStore) {
        defaultTemplateStore = createTemplateStore();
    }
    return defaultTemplateStore;
}
export async function uploadTemplate(input, store = getTemplateStore()) {
    const now = new Date().toISOString();
    const template = ArticleTemplateSchema.parse({
        id: input.id ?? createId("tpl"),
        name: input.name.trim() || input.filename?.replace(/\.md$/i, "") || "Untitled template",
        filename: input.filename ?? "",
        markdown: input.markdown.trim(),
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
    });
    if (template.markdown.length < 20) {
        throw new Error("Template markdown is too short");
    }
    if (!template.markdown.includes("#") && !template.markdown.includes("{{")) {
        // Allow but warn via notes not throw — structure may still guide prose
    }
    return store.save(template);
}
