import type { PipelineRun } from "@/models";

export interface RunStore {
  save(run: PipelineRun): Promise<PipelineRun>;
  get(id: string): Promise<PipelineRun | null>;
  require(id: string): Promise<PipelineRun>;
  list(): Promise<PipelineRun[]>;
  close?(): Promise<void>;
}
