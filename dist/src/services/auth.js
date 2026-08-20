import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { appConfig } from "../config";
import { connectMongo, formatMongoError } from "./mongo-connection";
import { logger } from "./logger";
const scrypt = promisify(scryptCb);
export const AUTH_COOKIE = "sw_session";
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{2,40}$/;
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();
export function normalizeUsername(raw) {
    return raw.trim().toLowerCase();
}
export function assertUsername(raw) {
    const username = normalizeUsername(raw);
    if (!USERNAME_PATTERN.test(username)) {
        throw new Error("Username must be 2–40 characters: letters, numbers, dot, underscore, or hyphen");
    }
    return username;
}
export function assertPassword(password) {
    if (typeof password !== "string" || password.length < 8) {
        throw new Error("Password must be at least 8 characters");
    }
    if (password.length > 200) {
        throw new Error("Password is too long");
    }
    return password;
}
export async function hashPassword(password) {
    const salt = randomBytes(16);
    const key = (await scrypt(password, salt, 32));
    return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
    const [scheme, saltHex, hashHex] = stored.split(":");
    if (scheme !== "scrypt" || !saltHex || !hashHex)
        return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = (await scrypt(password, salt, 32));
    if (actual.length !== expected.length)
        return false;
    return timingSafeEqual(actual, expected);
}
export function getAuthSecret() {
    if (appConfig.auth.secret && appConfig.auth.secret.length >= 16) {
        return appConfig.auth.secret;
    }
    if (process.env.VERCEL) {
        const seed = process.env.MONGODB_URI || process.env.VERCEL_PROJECT_ID || "";
        if (seed.length >= 8) {
            return createHash("sha256").update(`spanwrap-pipeline-auth:${seed}`).digest("hex");
        }
        throw new Error("AUTH_SECRET is required on Vercel (32+ random characters). Add it in Project → Environment Variables.");
    }
    const filePath = path.join(appConfig.dataDir, "auth-secret");
    try {
        const existing = readFileSync(filePath, "utf8").trim();
        if (existing.length >= 16)
            return existing;
    }
    catch {
        // create below
    }
    mkdirSync(appConfig.dataDir, { recursive: true });
    const generated = randomBytes(32).toString("hex");
    writeFileSync(filePath, generated, { encoding: "utf8", mode: 0o600 });
    return generated;
}
export function signSession(username, secret = getAuthSecret(), ttlSec) {
    const days = appConfig.auth.sessionDays;
    const exp = Math.floor(Date.now() / 1000) + (ttlSec ?? days * 24 * 60 * 60);
    const payload = Buffer.from(JSON.stringify({ u: username, exp })).toString("base64url");
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${sig}`;
}
export function verifySession(token, secret = getAuthSecret()) {
    const dot = token.indexOf(".");
    if (dot < 1)
        return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!payload || !sig)
        return null;
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
        return null;
    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (typeof data.u !== "string" || typeof data.exp !== "number")
            return null;
        if (data.exp < Math.floor(Date.now() / 1000))
            return null;
        return { username: data.u };
    }
    catch {
        return null;
    }
}
export function parseCookies(header) {
    const out = {};
    if (!header)
        return out;
    for (const part of header.split(";")) {
        const i = part.indexOf("=");
        if (i < 0)
            continue;
        const key = part.slice(0, i).trim();
        const value = part.slice(i + 1).trim();
        if (!key)
            continue;
        try {
            out[key] = decodeURIComponent(value);
        }
        catch {
            out[key] = value;
        }
    }
    return out;
}
export function sessionFromRequest(req, secret) {
    const token = parseCookies(req.headers.cookie)[AUTH_COOKIE];
    if (!token)
        return null;
    try {
        return verifySession(token, secret ?? getAuthSecret());
    }
    catch {
        return null;
    }
}
export function sessionCookieHeader(token, req, maxAgeSec) {
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
    if (secure)
        parts.push("Secure");
    return parts.join("; ");
}
export function clearSessionCookieHeader(req) {
    return sessionCookieHeader("deleted", req, 0);
}
export function clientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (raw)
        return raw.split(",")[0].trim();
    return req.socket.remoteAddress || "unknown";
}
export function loginRateLimited(key) {
    const now = Date.now();
    const rec = loginAttempts.get(key);
    if (!rec || rec.resetAt < now) {
        loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        return false;
    }
    rec.count += 1;
    return rec.count > MAX_LOGIN_ATTEMPTS;
}
export function clearLoginFailures(key) {
    loginAttempts.delete(key);
}
export class FileUserStore {
    rootDir;
    constructor(rootDir = appConfig.dataDir) {
        this.rootDir = rootDir;
    }
    filePath() {
        return path.join(this.rootDir, "users.json");
    }
    readAll() {
        try {
            const raw = JSON.parse(readFileSync(this.filePath(), "utf8"));
            if (!Array.isArray(raw.users))
                return [];
            return raw.users.filter(isAuthUser);
        }
        catch {
            return [];
        }
    }
    writeAll(users) {
        mkdirSync(this.rootDir, { recursive: true });
        writeFileSync(this.filePath(), JSON.stringify({ users }, null, 2), "utf8");
    }
    async count() {
        return this.readAll().length;
    }
    async get(username) {
        const id = normalizeUsername(username);
        return this.readAll().find((u) => u.username === id) ?? null;
    }
    async list() {
        return this.readAll().map(({ passwordHash: _h, ...rest }) => rest);
    }
    async upsert(user) {
        const users = this.readAll().filter((u) => u.username !== user.username);
        users.push(user);
        this.writeAll(users);
        return user;
    }
}
export class MongoUserStore {
    uri;
    dbName;
    collection = null;
    constructor(uri, dbName) {
        this.uri = uri;
        this.dbName = dbName;
    }
    async col() {
        if (this.collection)
            return this.collection;
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
    async get(username) {
        const col = await this.col();
        const doc = await col.findOne({ username: normalizeUsername(username) });
        return doc ? toAuthUser(doc) : null;
    }
    async list() {
        const col = await this.col();
        const docs = await col.find({}).sort({ username: 1 }).toArray();
        return docs.map((d) => {
            const u = toAuthUser(d);
            return { username: u.username, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt };
        });
    }
    async upsert(user) {
        const col = await this.col();
        await col.replaceOne({ username: user.username }, user, { upsert: true });
        return user;
    }
}
function isAuthUser(value) {
    if (!value || typeof value !== "object")
        return false;
    const rec = value;
    return typeof rec.username === "string" && typeof rec.passwordHash === "string";
}
function toAuthUser(doc) {
    const rec = doc;
    return {
        username: String(rec.username),
        passwordHash: String(rec.passwordHash),
        createdAt: typeof rec.createdAt === "string" ? rec.createdAt : new Date().toISOString(),
        lastLoginAt: typeof rec.lastLoginAt === "string" ? rec.lastLoginAt : null,
    };
}
let defaultStore = null;
export function createUserStore() {
    if (appConfig.storage.backend === "mongodb") {
        const uri = appConfig.storage.mongoUri;
        if (!uri)
            throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI");
        return new MongoUserStore(uri, appConfig.storage.mongoDb);
    }
    return new FileUserStore(appConfig.dataDir);
}
export function getUserStore() {
    if (!defaultStore)
        defaultStore = createUserStore();
    return defaultStore;
}
/** Test helper. */
export function resetUserStoreCache() {
    defaultStore = null;
}
let seedPromise = null;
export async function ensureSeedUser() {
    if (!seedPromise) {
        seedPromise = (async () => {
            const username = appConfig.auth.username;
            const password = appConfig.auth.password;
            if (!username || !password)
                return;
            const store = getUserStore();
            if ((await store.count()) > 0)
                return;
            try {
                const user = {
                    username: assertUsername(username),
                    passwordHash: await hashPassword(assertPassword(password)),
                    createdAt: new Date().toISOString(),
                    lastLoginAt: null,
                };
                await store.upsert(user);
                logger.info("Seeded first UI user from AUTH_USERNAME", { username: user.username });
            }
            catch (error) {
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
export async function createUser(usernameRaw, password) {
    const username = assertUsername(usernameRaw);
    const store = getUserStore();
    if (await store.get(username)) {
        throw new Error("That username is already taken");
    }
    const user = {
        username,
        passwordHash: await hashPassword(assertPassword(password)),
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
    };
    await store.upsert(user);
    return { username: user.username, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt };
}
export async function authenticateUser(usernameRaw, password) {
    const username = normalizeUsername(usernameRaw);
    const store = getUserStore();
    const user = await store.get(username);
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) {
        throw new Error("Invalid username or password");
    }
    const next = { ...user, lastLoginAt: new Date().toISOString() };
    await store.upsert(next);
    return next;
}
