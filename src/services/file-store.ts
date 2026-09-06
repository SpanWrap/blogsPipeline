import { PipelineRun, PipelineRunSchema } from "../models";
import { getDataFs, LocalDataFs, type DataFs } from "./data-fs";
import type { RunStore } from "./store";

export class FileRunStore implements RunStore {
  private readonly fs: DataFs;

  constructor(fsOrRoot: DataFs | string = getDataFs()) {
    this.fs = typeof fsOrRoot === "string" ? new LocalDataFs(fsOrRoot) : fsOrRoot;
  }

  private key(id: string) {
    return `runs/${id}.json`;
  }

  async save(run: PipelineRun): Promise<PipelineRun> {
    const parsed = PipelineRunSchema.parse({
      ...run,
      updatedAt: new Date().toISOString(),
    });
    await this.fs.writeText(this.key(parsed.id), JSON.stringify(parsed, null, 2));
    return parsed;
  }

  async get(id: string): Promise<PipelineRun | null> {
    const raw = await this.fs.readText(this.key(id));
    if (!raw) return null;
    return PipelineRunSchema.parse(JSON.parse(raw));
  }

  async require(id: string): Promise<PipelineRun> {
    const run = await this.get(id);
    if (!run) throw new Error(`Pipeline run not found: ${id}`);
    return run;
  }

  async delete(id: string): Promise<boolean> {
    return this.fs.delete(this.key(id));
  }

  async list(): Promise<PipelineRun[]> {
    const names = await this.fs.listNames("runs");
    const runs: PipelineRun[] = [];
    for (const file of names) {
      if (!file.endsWith(".json")) continue;
      const raw = await this.fs.readText(`runs/${file}`);
      if (!raw) continue;
      runs.push(PipelineRunSchema.parse(JSON.parse(raw)));
    }
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
