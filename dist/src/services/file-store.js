import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../config";
import { PipelineRunSchema } from "../models";
export class FileRunStore {
    rootDir;
    constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
    }
    runsDir() {
        return path.join(this.rootDir, "runs");
    }
    runPath(id) {
        return path.join(this.runsDir(), `${id}.json`);
    }
    async ensureReady() {
        await mkdir(this.runsDir(), { recursive: true });
    }
    async save(run) {
        await this.ensureReady();
        const parsed = PipelineRunSchema.parse({
            ...run,
            updatedAt: new Date().toISOString(),
        });
        await writeFile(this.runPath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
        return parsed;
    }
    async get(id) {
        try {
            const raw = await readFile(this.runPath(id), "utf8");
            return PipelineRunSchema.parse(JSON.parse(raw));
        }
        catch (error) {
            const code = error.code;
            if (code === "ENOENT")
                return null;
            throw error;
        }
    }
    async require(id) {
        const run = await this.get(id);
        if (!run)
            throw new Error(`Pipeline run not found: ${id}`);
        return run;
    }
    async delete(id) {
        try {
            const { rm } = await import("node:fs/promises");
            await rm(this.runPath(id));
            return true;
        }
        catch (error) {
            const code = error.code;
            if (code === "ENOENT")
                return false;
            throw error;
        }
    }
    async list() {
        await this.ensureReady();
        const files = await readdir(this.runsDir());
        const runs = [];
        for (const file of files) {
            if (!file.endsWith(".json"))
                continue;
            const raw = await readFile(path.join(this.runsDir(), file), "utf8");
            runs.push(PipelineRunSchema.parse(JSON.parse(raw)));
        }
        return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
}
