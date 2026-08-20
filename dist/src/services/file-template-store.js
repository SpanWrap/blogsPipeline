import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../config";
import { ArticleTemplateSchema } from "../models";
export class FileTemplateStore {
    rootDir;
    constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
    }
    dir() {
        return path.join(this.rootDir, "templates");
    }
    filePath(id) {
        return path.join(this.dir(), `${id}.json`);
    }
    async ensureReady() {
        await mkdir(this.dir(), { recursive: true });
    }
    async save(template) {
        await this.ensureReady();
        const parsed = ArticleTemplateSchema.parse({
            ...template,
            updatedAt: new Date().toISOString(),
        });
        await writeFile(this.filePath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
        return parsed;
    }
    async get(id) {
        try {
            const raw = await readFile(this.filePath(id), "utf8");
            return ArticleTemplateSchema.parse(JSON.parse(raw));
        }
        catch (error) {
            const code = error.code;
            if (code === "ENOENT")
                return null;
            throw error;
        }
    }
    async require(id) {
        const t = await this.get(id);
        if (!t)
            throw new Error(`Template not found: ${id}`);
        return t;
    }
    async list() {
        await this.ensureReady();
        const files = await readdir(this.dir());
        const out = [];
        for (const file of files) {
            if (!file.endsWith(".json"))
                continue;
            const raw = await readFile(path.join(this.dir(), file), "utf8");
            out.push(ArticleTemplateSchema.parse(JSON.parse(raw)));
        }
        return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    async delete(id) {
        try {
            await unlink(this.filePath(id));
            return true;
        }
        catch (error) {
            const code = error.code;
            if (code === "ENOENT")
                return false;
            throw error;
        }
    }
}
