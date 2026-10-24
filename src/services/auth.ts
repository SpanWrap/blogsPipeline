import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import type { IncomingMessage } from "node:http";
import type { Collection, Document } from "mongodb";
import path from "node:path";
import { appConfig } from "../config";
import {
  effectivePermissions,
  normalizePermissions,
  type ModulePermissions,
} from "./access";
import { getDataFs, LocalDataFs, type DataFs, usesS3Storage } from "./data-fs";
import { connectMongo, formatMongoError } from "./mongo-connection";
import { logger } from "./logger";

const scrypt = promisify(scryptCb);

export const AUTH_COOKIE = "sw_session";
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{2,40}$/;

export type AuthUser = {
  username: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string | null;
  /** False disables sign-in. Missing means active. */
  active?: boolean;
  /** Missing means the account was created before roles and is an administrator. */
  permissions?: ModulePermissions | null;
};

export type PublicUser = {
  username: string;
  createdAt: string;
  lastLoginAt?: string | null;
  active: boolean;
  permissions: ModulePermissions;
};

export type SessionUser = { username: string };

export type UserStore = {
  count(): Promise<number>;
  get(username: string): Promise<AuthUser | null>;
  list(): Promise<PublicUser[]>;
  upsert(user: AuthUser): Promise<AuthUser>;
  delete(username: string): Promise<boolean>;
};

export function publicUser(user: AuthUser): PublicUser {
  return {
    username: user.username,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
    active: user.active !== false,
    permissions: effectivePermissions(user),
  };
}

function isActiveAdmin(user: { active?: boolean; permissions?: unknown }): boolean {
  return user.active !== false && effectivePermissions(user).people === "full";
}

const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function assertUsername(raw: string): string {
  const username = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Username must be 2–40 characters: letters, numbers, dot, underscore, or hyphen");
  }
  return username;
}

export function assertPassword(password: string): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (password.length > 200) {
    throw new Error("Password is too long");
  }
  return password;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(password, salt, 32)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function getAuthSecret(): string {
  if (appConfig.auth.secret && appConfig.auth.secret.length >= 16) {
    return appConfig.auth.secret;
  }
  if (usesS3Storage() || process.env.VERCEL) {
    const seed = process.env.MONGODB_URI || process.env.VERCEL_PROJECT_ID || "";
    if (process.env.VERCEL && seed.length >= 8) {
      return createHash("sha256").update(`spanwrap-pipeline-auth:${seed}`).digest("hex");
    }
    throw new Error(
      "AUTH_SECRET is required when using S3 (or Vercel). Set a 32+ character secret in the environment.",
    );
  }
  const filePath = path.join(appConfig.dataDir, "auth-secret");
  try {
    const existing = readFileSync(filePath, "utf8").trim();
    if (existing.length >= 16) return existing;
  } catch {
    // create below
  }
  mkdirSync(appConfig.dataDir, { recursive: true });
  const generated = randomBytes(32).toString("hex");
  writeFileSync(filePath, generated, { encoding: "utf8", mode: 0o600 });
  return generated;
}

export function signSession(username: string, secret = getAuthSecret(), ttlSec?: number): string {
  const days = appConfig.auth.sessionDays;
  const exp = Math.floor(Date.now() / 1000) + (ttlSec ?? days * 24 * 60 * 60);
  const payload = Buffer.from(JSON.stringify({ u: username, exp })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token: string, secret = getAuthSecret()): SessionUser | null {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: unknown;
      exp?: unknown;
    };
    if (typeof data.u !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { username: data.u };
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function sessionFromRequest(req: IncomingMessage, secret?: string): SessionUser | null {
  const token = parseCookies(req.headers.cookie)[AUTH_COOKIE];
  if (!token) return null;
  try {
    return verifySession(token, secret ?? getAuthSecret());
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string, req: IncomingMessage, maxAgeSec?: number): string {
  const days = appConfig.auth.sessionDays;
  const maxAge = maxAgeSec ?? days * 24 * 60 * 60;
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const secure = proto === "https";
  const parts = [
    `${AUTH_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(req: IncomingMessage): string {
  return sessionCookieHeader("deleted", req, 0);
}

export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) return raw.split(",")[0]!.trim();
  return req.socket.remoteAddress || "unknown";
}

export function loginRateLimited(key: string): boolean {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || rec.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_LOGIN_ATTEMPTS;
}

export function clearLoginFailures(key: string) {
  loginAttempts.delete(key);
}

export class FileUserStore implements UserStore {
  private readonly fs: DataFs;

  constructor(fsOrRoot: DataFs | string = getDataFs()) {
    this.fs = typeof fsOrRoot === "string" ? new LocalDataFs(fsOrRoot) : fsOrRoot;
  }

  private key() {
    return "users.json";
  }

  private async readAll(): Promise<AuthUser[]> {
    try {
      const text = await this.fs.readText(this.key());
      if (!text) return [];
      const raw = JSON.parse(text) as { users?: unknown };
      if (!Array.isArray(raw.users)) return [];
      return raw.users.filter(isAuthUser);
    } catch {
      return [];
    }
  }

  private async writeAll(users: AuthUser[]) {
    await this.fs.writeText(this.key(), JSON.stringify({ users }, null, 2));
  }

  async count() {
    return (await this.readAll()).length;
  }

  async get(username: string) {
    const id = normalizeUsername(username);
    return (await this.readAll()).find((u) => u.username === id) ?? null;
  }

  async list() {
    return (await this.readAll()).map(publicUser);
  }

  async upsert(user: AuthUser) {
    const users = (await this.readAll()).filter((u) => u.username !== user.username);
    users.push(user);
    await this.writeAll(users);
    return user;
  }

  async delete(username: string) {
    const id = normalizeUsername(username);
    const users = await this.readAll();
    const next = users.filter((u) => u.username !== id);
    if (next.length === users.length) return false;
    await this.writeAll(next);
    return true;
  }
}

export class MongoUserStore implements UserStore {
  private collection: Collection<Document> | null = null;

  constructor(
    private readonly uri: string,
    private readonly dbName: string,
  ) {}

  private async col(): Promise<Collection<Document>> {
    if (this.collection) return this.collection;
    const { db } = await connectMongo(this.uri, this.dbName);
    const col = db.collection("auth_users");
    await col.createIndex({ username: 1 }, { unique: true });
    this.collection = col;
    return col;
  }

  async count() {
    const col = await this.col();
    return col.countDocuments();
  }

  async get(username: string) {
    const col = await this.col();
    const doc = await col.findOne({ username: normalizeUsername(username) });
    return doc ? toAuthUser(doc) : null;
  }

  async list() {
    const col = await this.col();
    const docs = await col.find({}).sort({ username: 1 }).toArray();
    return docs.map((d) => publicUser(toAuthUser(d)));
  }

  async upsert(user: AuthUser) {
    const col = await this.col();
    await col.replaceOne({ username: user.username }, user as unknown as Document, { upsert: true });
    return user;
  }

  async delete(username: string) {
    const col = await this.col();
    const result = await col.deleteOne({ username: normalizeUsername(username) });
    return result.deletedCount > 0;
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.username === "string" && typeof rec.passwordHash === "string";
}

function toAuthUser(doc: Document): AuthUser {
  const rec = doc as unknown as Record<string, unknown>;
  const permissions =
    rec.permissions && typeof rec.permissions === "object"
      ? normalizePermissions(rec.permissions)
      : undefined;
  return {
    username: String(rec.username),
    passwordHash: String(rec.passwordHash),
    createdAt: typeof rec.createdAt === "string" ? rec.createdAt : new Date().toISOString(),
    lastLoginAt: typeof rec.lastLoginAt === "string" ? rec.lastLoginAt : null,
    active: rec.active === false ? false : undefined,
    permissions,
  };
}

let defaultStore: UserStore | null = null;

export function createUserStore(): UserStore {
  if (appConfig.storage.backend === "mongodb") {
    const uri = appConfig.storage.mongoUri;
    if (!uri) throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI");
    return new MongoUserStore(uri, appConfig.storage.mongoDb);
  }
  return new FileUserStore();
}

export function getUserStore(): UserStore {
  if (!defaultStore) defaultStore = createUserStore();
  return defaultStore;
}

/** Test helper. */
export function resetUserStoreCache() {
  defaultStore = null;
}

let seedPromise: Promise<void> | null = null;

export async function ensureSeedUser(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const username = appConfig.auth.username;
      const password = appConfig.auth.password;
      if (!username || !password) return;
      const store = getUserStore();
      if ((await store.count()) > 0) return;
      try {
        const user: AuthUser = {
          username: assertUsername(username),
          passwordHash: await hashPassword(assertPassword(password)),
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
        };
        await store.upsert(user);
        logger.info("Seeded first UI user from AUTH_USERNAME", { username: user.username });
      } catch (error) {
        logger.warn("Could not seed AUTH_USERNAME", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })().catch((error) => {
      seedPromise = null;
      logger.warn("Auth seed failed", {
        error: error instanceof Error ? formatMongoError(error) : String(error),
      });
    });
  }
  await seedPromise;
}

export async function createUser(
  usernameRaw: string,
  password: string,
  permissions?: unknown,
): Promise<PublicUser> {
  const username = assertUsername(usernameRaw);
  const store = getUserStore();
  if (await store.get(username)) {
    throw new Error("That username is already taken");
  }
  const user: AuthUser = {
    username,
    passwordHash: await hashPassword(assertPassword(password)),
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    active: true,
    permissions: permissions === undefined ? undefined : normalizePermissions(permissions),
  };
  await store.upsert(user);
  return publicUser(user);
}

async function countActiveAdmins(store: UserStore): Promise<number> {
  const users = await store.list();
  return users.filter((user) => isActiveAdmin(user)).length;
}

export async function updateUserAccount(
  targetRaw: string,
  patch: { password?: string; permissions?: unknown; active?: boolean },
): Promise<PublicUser> {
  const target = assertUsername(targetRaw);
  const store = getUserStore();
  const existing = await store.get(target);
  if (!existing) throw new Error("User not found");
  const next: AuthUser = { ...existing };
  if (typeof patch.password === "string" && patch.password.length > 0) {
    next.passwordHash = await hashPassword(assertPassword(patch.password));
  }
  if (patch.permissions !== undefined) {
    next.permissions = normalizePermissions(patch.permissions);
  }
  if (typeof patch.active === "boolean") next.active = patch.active;
  if (isActiveAdmin(existing) && !isActiveAdmin(next)) {
    if ((await countActiveAdmins(store)) <= 1) {
      throw new Error("You can't remove the last administrator");
    }
  }
  await store.upsert(next);
  return publicUser(next);
}

export async function deleteUser(actorUsername: string, targetRaw: string): Promise<void> {
  const target = assertUsername(targetRaw);
  if (target === normalizeUsername(actorUsername)) {
    throw new Error("You can't delete the account you're signed in with");
  }
  const store = getUserStore();
  const existing = await store.get(target);
  if (!existing) throw new Error("User not found");
  if ((await store.count()) <= 1) throw new Error("You can't delete the last account");
  if (isActiveAdmin(existing) && (await countActiveAdmins(store)) <= 1) {
    throw new Error("You can't delete the last administrator");
  }
  const removed = await store.delete(target);
  if (!removed) throw new Error("User not found");
}

export async function authenticateUser(usernameRaw: string, password: string): Promise<AuthUser> {
  const username = normalizeUsername(usernameRaw);
  const store = getUserStore();
  const user = await store.get(username);
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    throw new Error("Invalid username or password");
  }
  if (user.active === false) {
    throw new Error("This account is disabled");
  }
  const next = { ...user, lastLoginAt: new Date().toISOString() };
  await store.upsert(next);
  return next;
}
