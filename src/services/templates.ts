import { appConfig } from "../config";
import { ArticleTemplate, ArticleTemplateSchema } from "../models";
import { createId } from "../utils/idempotency";
import { FileTemplateStore } from "./file-template-store";
import { MongoTemplateStore } from "./mongo-template-store";
import type { TemplateStore } from "./template-store";

export type { TemplateStore } from "./template-store";
export { FileTemplateStore } from "./file-template-store";
export { MongoTemplateStore } from "./mongo-template-store";

let defaultTemplateStore: TemplateStore | null = null;

export function createTemplateStore(backend = appConfig.storage.backend): TemplateStore {
  if (backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) {
      throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI for templates");
    }
    return new MongoTemplateStore(uri, appConfig.storage.mongoDb, "article_templates");
  }
  return new FileTemplateStore();
}

export function getTemplateStore(): TemplateStore {
  if (!defaultTemplateStore) {
    defaultTemplateStore = createTemplateStore();
  }
  return defaultTemplateStore;
}

export type UploadTemplateInput = {
  name: string;
  markdown: string;
  filename?: string;
  notes?: string | null;
  id?: string;
};

export async function uploadTemplate(
  input: UploadTemplateInput,
  store: TemplateStore = getTemplateStore(),
): Promise<ArticleTemplate> {
  const existing = input.id ? await store.get(input.id) : null;
  if (input.id && !existing) {
    throw new Error(`Template not found: ${input.id}`);
  }
  const now = new Date().toISOString();
  const template = ArticleTemplateSchema.parse({
    id: input.id ?? createId("tpl"),
    name: input.name.trim() || input.filename?.replace(/\.md$/i, "") || existing?.name || "Untitled template",
    filename: input.filename ?? existing?.filename ?? "",
    markdown: input.markdown.trim(),
    notes: input.notes !== undefined ? input.notes : (existing?.notes ?? null),
    createdAt: existing?.createdAt ?? now,
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
