import { ArticleTemplate, ArticleTemplateSchema } from "../models";
import { getDataFs, LocalDataFs, type DataFs } from "./data-fs";
import type { TemplateStore } from "./template-store";

export class FileTemplateStore implements TemplateStore {
  private readonly fs: DataFs;

  constructor(fsOrRoot: DataFs | string = getDataFs()) {
    this.fs = typeof fsOrRoot === "string" ? new LocalDataFs(fsOrRoot) : fsOrRoot;
  }

  private key(id: string) {
    return `templates/${id}.json`;
  }

  async save(template: ArticleTemplate): Promise<ArticleTemplate> {
    const parsed = ArticleTemplateSchema.parse({
      ...template,
      updatedAt: new Date().toISOString(),
    });
    await this.fs.writeText(this.key(parsed.id), JSON.stringify(parsed, null, 2));
    return parsed;
  }

  async get(id: string): Promise<ArticleTemplate | null> {
    const raw = await this.fs.readText(this.key(id));
    if (!raw) return null;
    return ArticleTemplateSchema.parse(JSON.parse(raw));
  }

  async require(id: string): Promise<ArticleTemplate> {
    const t = await this.get(id);
    if (!t) throw new Error(`Template not found: ${id}`);
    return t;
  }

  async list(): Promise<ArticleTemplate[]> {
    const names = await this.fs.listNames("templates");
    const out: ArticleTemplate[] = [];
    for (const file of names) {
      if (!file.endsWith(".json")) continue;
      const raw = await this.fs.readText(`templates/${file}`);
      if (!raw) continue;
      out.push(ArticleTemplateSchema.parse(JSON.parse(raw)));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<boolean> {
    return this.fs.delete(this.key(id));
  }
}
