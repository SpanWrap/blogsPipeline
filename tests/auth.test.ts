import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileUserStore,
  assertUsername,
  hashPassword,
  loginRateLimited,
  parseCookies,
  signSession,
  verifyPassword,
  verifySession,
} from "@/services/auth";
import { FileActivityLogStore } from "@/services/activity-log";

describe("auth crypto", () => {
  it("hashes and verifies passwords", async () => {
    const stored = await hashPassword("correct-horse");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("correct-horse", stored)).toBe(true);
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("signs and verifies sessions", () => {
    const secret = "test-secret-at-least-16";
    const token = signSession("jai", secret, 60);
    expect(verifySession(token, secret)).toEqual({ username: "jai" });
    expect(verifySession("tampered." + token.split(".")[1], secret)).toBeNull();
    expect(verifySession(token, "other-secret-16ch")).toBeNull();
  });

  it("rejects expired sessions", () => {
    const secret = "test-secret-at-least-16";
    const token = signSession("jai", secret, -10);
    expect(verifySession(token, secret)).toBeNull();
  });

  it("parses cookies", () => {
    expect(parseCookies("sw_session=abc; other=1")).toEqual({
      sw_session: "abc",
      other: "1",
    });
  });

  it("normalizes usernames", () => {
    expect(assertUsername("  Jai_01 ")).toBe("jai_01");
    expect(() => assertUsername("a")).toThrow(/2–40/);
    expect(() => assertUsername("bad name")).toThrow();
  });

  it("rate-limits repeated login keys", () => {
    const key = `test-${Date.now()}`;
    const blocked = [];
    for (let i = 0; i < 10; i++) blocked.push(loginRateLimited(key));
    expect(blocked.filter(Boolean).length).toBeGreaterThan(0);
    expect(blocked[0]).toBe(false);
  });
});

describe("file user store", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("creates and looks up a user", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "pipeline-auth-"));
    const store = new FileUserStore(dir);
    expect(await store.count()).toBe(0);
    await store.upsert({
      username: "jai",
      passwordHash: await hashPassword("password1"),
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    });
    expect(await store.count()).toBe(1);
    expect((await store.get("JAI"))?.username).toBe("jai");
    const listed = await store.list();
    expect(listed[0]?.username).toBe("jai");
    expect(listed[0] && "passwordHash" in listed[0]).toBe(false);
  });
});

describe("file activity log", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("appends newest first and omits secrets from stored details", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "pipeline-logs-"));
    const store = new FileActivityLogStore(dir);
    await store.append({
      username: "jai",
      action: "login",
      method: "POST",
      path: "/api/auth/login",
      ip: "127.0.0.1",
    });
    await store.append({
      username: "jai",
      action: "run_created",
      method: "POST",
      path: "/api/runs",
      details: { runId: "run_abc", topic: "Agents" },
    });
    const list = await store.list(10);
    expect(list[0]?.action).toBe("run_created");
    expect(list[1]?.action).toBe("login");
    expect(JSON.stringify(list)).not.toMatch(/password|apiKey/i);
  });
});
