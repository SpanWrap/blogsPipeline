import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileRunStore } from "../src/services/file-store";
import { LocalDataFs } from "../src/services/data-fs";
import { PipelineRunSchema } from "../src/models";

describe("LocalDataFs + FileRunStore", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips run JSON", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "data-fs-"));
    const store = new FileRunStore(new LocalDataFs(dir));
    const run = PipelineRunSchema.parse({
      id: "run_test",
      status: "CREATED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      idempotencyKey: "idem_test",
      brief: {
        topic: "S3 storage",
        targetAudience: "devs",
        tone: "clear",
      },
      events: [],
    });
    await store.save(run);
    const loaded = await store.require("run_test");
    expect(loaded.brief.topic).toBe("S3 storage");
    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(await store.delete("run_test")).toBe(true);
    expect(await store.get("run_test")).toBeNull();
  });
});
