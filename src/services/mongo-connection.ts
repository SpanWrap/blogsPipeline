import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

/**
 * Percent-encode user/password in a MongoDB URI when they are present.
 * Prevents auth failures when passwords contain special characters.
 */
export function normalizeMongoUri(uri: string): string {
  const trimmed = uri.trim();
  const match = trimmed.match(/^(mongodb(?:\+srv)?:\/\/)([^/?#]+)(@)(.+)$/i);
  if (!match) return trimmed;

  const [, scheme, userInfo, at, hostAndRest] = match;
  const colon = userInfo!.indexOf(":");
  if (colon < 0) return trimmed;

  const username = userInfo!.slice(0, colon);
  const password = userInfo!.slice(colon + 1);
  if (!username || !password) return trimmed;

  // Avoid double-encoding; if already encoded, decode then re-encode once.
  let userDecoded = username;
  let passDecoded = password;
  try {
    userDecoded = decodeURIComponent(username);
    passDecoded = decodeURIComponent(password);
  } catch {
    // keep raw
  }

  return `${scheme}${encodeURIComponent(userDecoded)}:${encodeURIComponent(passDecoded)}${at}${hostAndRest}`;
}

export function formatMongoError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("bad auth") ||
    lower.includes("authentication failed") ||
    lower.includes("auth failed")
  ) {
    return [
      "MongoDB authentication failed.",
      "Check MONGODB_URI username/password in .env or Vercel env vars,",
      "reset the database user password in Atlas → Database Access,",
      "and ensure Network Access allows your IP (use 0.0.0.0/0 on Vercel).",
    ].join(" ");
  }
  if (lower.includes("enotfound") || lower.includes("getaddrinfo")) {
    return `MongoDB host not found. Check the cluster hostname in MONGODB_URI. (${message})`;
  }
  if (lower.includes("ip") && lower.includes("whitelist")) {
    return `MongoDB blocked this IP. Add it in Atlas → Network Access. (${message})`;
  }
  return `MongoDB error: ${message}`;
}

export type MongoConnection = {
  client: MongoClient;
  db: Db;
};

/**
 * Connect with clearer errors and optional shared options.
 */
export async function connectMongo(
  uri: string,
  dbName: string,
  options: MongoClientOptions = {},
): Promise<MongoConnection> {
  const normalized = normalizeMongoUri(uri);
  const client = new MongoClient(normalized, {
    serverSelectionTimeoutMS: 15_000,
    ...options,
  });
  try {
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    return { client, db };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw new Error(formatMongoError(error));
  }
}
