import type { PipelineRun } from "../models";
import type { RunStore } from "./store";

/**
 * Short-lived in-process cache so frequent poll GETs (and warm serverless
 * instances) avoid repeat S3/disk reads during an active pipeline run.
 */
export class CachedRunStore implements RunStore {
  private byId = new Map<string, { run: PipelineRun; at: number }>();
  private listCache: { runs: PipelineRun[]; at: number } | null = null;

  constructor(
    private readonly inner: RunStore,
    private readonly getTtlMs = 1500,
    private readonly listTtlMs = 2500,
  ) {}

  async save(run: PipelineRun): Promise<PipelineRun> {
    const saved = await this.inner.save(run);
    this.byId.set(saved.id, { run: saved, at: Date.now() });
    this.listCache = null;
    return saved;
  }

  async get(id: string): Promise<PipelineRun | null> {
    const hit = this.byId.get(id);
    if (hit && Date.now() - hit.at < this.getTtlMs) {
      // Always revalidate in-flight runs so leases/heartbeats stay visible to pollers.
      const status = hit.run.status;
      if (status !== "RESEARCHING" && status !== "GENERATING" && status !== "QUALITY_CHECK") {
        return hit.run;
      }
    }
    const run = await this.inner.get(id);
    if (run) this.byId.set(id, { run, at: Date.now() });
    else this.byId.delete(id);
    return run;
  }

  async require(id: string): Promise<PipelineRun> {
    const run = await this.get(id);
    if (!run) throw new Error(`Pipeline run not found: ${id}`);
    return run;
  }

  async delete(id: string): Promise<boolean> {
    const ok = await this.inner.delete(id);
    this.byId.delete(id);
    this.listCache = null;
    return ok;
  }

  async list(): Promise<PipelineRun[]> {
    if (this.listCache && Date.now() - this.listCache.at < this.listTtlMs) {
      return this.listCache.runs;
    }
    const runs = await this.inner.list();
    this.listCache = { runs, at: Date.now() };
    for (const run of runs) {
      this.byId.set(run.id, { run, at: Date.now() });
    }
    return runs;
  }

  async close(): Promise<void> {
    await this.inner.close?.();
  }
}
