import fs from "node:fs";
import path from "node:path";
import { appConfig } from "../config";

export type TemplateMemory = {
  lastTemplateId: string | null;
  lastStylePresetId: string | null;
  updatedAt: string;
};

function memoryPath(): string {
  return path.join(appConfig.dataDir, "template-memory.json");
}

export function loadTemplateMemory(): TemplateMemory {
  try {
    const raw = JSON.parse(fs.readFileSync(memoryPath(), "utf8"));
    return {
      lastTemplateId: raw.lastTemplateId ?? null,
      lastStylePresetId: raw.lastStylePresetId ?? null,
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { lastTemplateId: null, lastStylePresetId: null, updatedAt: new Date().toISOString() };
  }
}

export function saveTemplateMemory(partial: Partial<TemplateMemory>): TemplateMemory {
  const prev = loadTemplateMemory();
  const next: TemplateMemory = {
    lastTemplateId: partial.lastTemplateId !== undefined ? partial.lastTemplateId : prev.lastTemplateId,
    lastStylePresetId:
      partial.lastStylePresetId !== undefined ? partial.lastStylePresetId : prev.lastStylePresetId,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(memoryPath()), { recursive: true });
  fs.writeFileSync(memoryPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
