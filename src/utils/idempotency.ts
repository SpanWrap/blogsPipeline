import { createHash, randomUUID } from "node:crypto";

export function createId(prefix = "run"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function createIdempotencyKey(parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 32);
}
