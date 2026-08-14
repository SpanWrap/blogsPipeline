import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatMongoError, normalizeMongoUri } from "@/services/mongo-connection";

describe("mongo connection helpers", () => {
  it("encodes credentials in the URI", () => {
    const uri = normalizeMongoUri("mongodb+srv://user:p@ss:word@cluster.mongodb.net/");
    expect(uri).toContain("p%40ss%3Aword");
    expect(uri.startsWith("mongodb+srv://user:")).toBe(true);
  });

  it("formats auth errors clearly", () => {
    const msg = formatMongoError(new Error("bad auth : authentication failed"));
    expect(msg).toMatch(/MongoDB authentication failed/i);
    expect(msg).toMatch(/MONGODB_URI/i);
  });
});
