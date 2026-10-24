/** Module access for the pipeline UI. Levels match the inventory-style roles:
 *  none hides the module, view is read-only, edit can create and change,
 *  full can also delete and use sensitive actions (publish, manage people).
 */

export const ACCESS_LEVELS = ["none", "view", "edit", "full"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const APP_MODULES = [
  { id: "topics", label: "Hot topics" },
  { id: "runs", label: "Runs" },
  { id: "templates", label: "Templates" },
  { id: "autopilot", label: "Autopilot" },
  { id: "email", label: "Email" },
  { id: "llm", label: "LLM" },
  { id: "people", label: "People" },
  { id: "activity", label: "Activity" },
] as const;

export type ModuleId = (typeof APP_MODULES)[number]["id"];
export type ModulePermissions = Record<ModuleId, AccessLevel>;

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2, full: 3 };

export function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === "string" && (ACCESS_LEVELS as readonly string[]).includes(value);
}

export function allPermissions(level: AccessLevel): ModulePermissions {
  const out = {} as ModulePermissions;
  for (const mod of APP_MODULES) out[mod.id] = level;
  return out;
}

export const ROLE_PRESETS: Record<string, { label: string; permissions: ModulePermissions }> = {
  admin: { label: "Administrator", permissions: allPermissions("full") },
  editor: {
    label: "Editor",
    permissions: {
      topics: "edit",
      runs: "edit",
      templates: "edit",
      autopilot: "edit",
      email: "view",
      llm: "view",
      people: "none",
      activity: "view",
    },
  },
  viewer: {
    label: "Viewer",
    permissions: {
      topics: "view",
      runs: "view",
      templates: "view",
      autopilot: "view",
      email: "none",
      llm: "none",
      people: "none",
      activity: "view",
    },
  },
};

export function normalizePermissions(input: unknown): ModulePermissions {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out = {} as ModulePermissions;
  for (const mod of APP_MODULES) {
    const level = src[mod.id];
    out[mod.id] = isAccessLevel(level) ? level : "none";
  }
  return out;
}

/** Accounts created before roles existed stay administrators. */
export function effectivePermissions(user: { permissions?: unknown }): ModulePermissions {
  if (!user.permissions) return allPermissions("full");
  return normalizePermissions(user.permissions);
}

export function hasAccess(
  user: { permissions?: unknown },
  module: ModuleId,
  level: AccessLevel,
): boolean {
  return RANK[effectivePermissions(user)[module]] >= RANK[level];
}

export function roleLabel(permissions: ModulePermissions): string {
  for (const preset of Object.values(ROLE_PRESETS)) {
    const same = APP_MODULES.every((mod) => preset.permissions[mod.id] === permissions[mod.id]);
    if (same) return preset.label;
  }
  return "Custom";
}

/** Which module a signed-in request needs. Null means any signed-in user. */
export function requiredAccess(
  method: string,
  pathname: string,
): { module: ModuleId; level: AccessLevel } | null {
  if (pathname === "/api/users" || pathname.startsWith("/api/users/")) return null;
  if (pathname === "/api/health" || pathname === "/api/style-presets" || pathname === "/api/dashboard") {
    return null;
  }
  const m = method.toUpperCase();
  const read = m === "GET" || m === "HEAD";

  if (pathname.startsWith("/api/logs")) return { module: "activity", level: "view" };
  if (pathname.startsWith("/api/autopilot")) {
    const sensitive =
      pathname.endsWith("/retry-email") ||
      pathname.endsWith("/trigger") ||
      pathname.endsWith("/toggle");
    if (sensitive) return { module: "autopilot", level: "full" };
    return { module: "autopilot", level: read ? "view" : "edit" };
  }
  if (pathname.startsWith("/api/email-notify")) return { module: "email", level: read ? "view" : "edit" };
  if (pathname.startsWith("/api/llm")) return { module: "llm", level: read ? "view" : "edit" };
  if (pathname.startsWith("/api/templates")) {
    if (m === "DELETE") return { module: "templates", level: "full" };
    return { module: "templates", level: read ? "view" : "edit" };
  }
  if (pathname.startsWith("/api/reader-profiles")) {
    return { module: "autopilot", level: read ? "view" : "edit" };
  }
  if (
    pathname.startsWith("/api/topics") ||
    pathname.startsWith("/api/digest") ||
    pathname === "/api/trending"
  ) {
    return { module: "topics", level: read ? "view" : "edit" };
  }
  if (pathname.startsWith("/api/runs")) {
    if (m === "DELETE" || pathname.endsWith("/publish")) return { module: "runs", level: "full" };
    return { module: "runs", level: read ? "view" : "edit" };
  }
  return { module: "runs", level: read ? "view" : "edit" };
}
