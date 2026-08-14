import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "@/config";
import { PipelineRun, PipelineRunSchema } from "@/models";
import type { RunStore } from "./store";

export class FileRunStore implements RunStore {
  constructor(private readonly rootDir = appConfig.dataDir) {}

  private runsDir() {
    return path.join(this.rootDir, "runs");
  }

  private runPath(id: string) {
    return path.join(this.runsDir(), `${id}.json`);
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.runsDir(), { recursive: true });
  }

  async save(run: PipelineRun): Promise<PipelineRun> {
    await this.ensureReady();
    const parsed = PipelineRunSchema.parse({
      ...run,
      updatedAt: new Date().toISOString(),
    });
    await writeFile(this.runPath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
    return parsed;
  }

  async get(id: string): Promise<PipelineRun | null> {
    try {
      const raw = await readFile(this.runPath(id), "utf8");
      return PipelineRunSchema.parse(JSON.parse(raw));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw error;
    }
  }

  async require(id: string): Promise<PipelineRun> {
    const run = await this.get(id);
    if (!run) throw new Error(`Pipeline run not found: ${id}`);
    return run;
  }

  async list(): Promise<PipelineRun[]> {
    await this.ensureReady();
    const files = await readdir(this.runsDir());
    const runs: PipelineRun[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await readFile(path.join(this.runsDir(), file), "utf8");
      runs.push(PipelineRunSchema.parse(JSON.parse(raw)));
    }
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
