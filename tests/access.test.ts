import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  effectivePermissions,
  hasAccess,
  normalizePermissions,
  requiredAccess,
  ROLE_PRESETS,
  roleLabel,
} from "@/services/access";
import { FileUserStore, hashPassword, publicUser } from "@/services/auth";

describe("module access", () => {
  it("treats accounts without a permission map as administrators", () => {
    const perms = effectivePermissions({});
    expect(perms.people).toBe("full");
    expect(perms.runs).toBe("full");
    expect(hasAccess({}, "autopilot", "full")).toBe(true);
  });

  it("keeps a stored editor below publish and people admin", () => {
    const perms = normalizePermissions(ROLE_PRESETS.editor.permissions);
    expect(roleLabel(perms)).toBe("Editor");
    expect(hasAccess({ permissions: perms }, "runs", "edit")).toBe(true);
    expect(hasAccess({ permissions: perms }, "runs", "full")).toBe(false);
    expect(hasAccess({ permissions: perms }, "people", "view")).toBe(false);
  });

  it("asks for full access on publish and delete", () => {
    expect(requiredAccess("POST", "/api/runs/run_1/publish")).toEqual({
      module: "runs",
      level: "full",
    });
    expect(requiredAccess("DELETE", "/api/runs/run_1")).toEqual({
      module: "runs",
      level: "full",
    });
    expect(requiredAccess("GET", "/api/runs")).toEqual({ module: "runs", level: "view" });
    expect(requiredAccess("PATCH", "/api/users/ada")).toBeNull();
  });
});

describe("user records keep access off the password hash", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("lists permissions and omits the hash", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "pipeline-access-"));
    const store = new FileUserStore(dir);
    await store.upsert({
      username: "ada",
      passwordHash: await hashPassword("password1"),
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      active: true,
      permissions: ROLE_PRESETS.viewer.permissions,
    });
    const listed = await store.list();
    expect(listed[0]?.permissions.topics).toBe("view");
    expect(listed[0]?.active).toBe(true);
    expect(JSON.stringify(listed)).not.toMatch(/passwordHash|scrypt/);
    const raw = await store.get("ada");
    expect(raw && publicUser(raw).permissions.people).toBe("none");
  });
});
