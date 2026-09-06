import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { appConfig } from "../config";

/**
 * Relative-key blob store for pipeline persistence (.data locally or S3).
 * Keys use forward slashes, no leading slash (e.g. "runs/abc.json").
 */
export interface DataFs {
  readText(key: string): Promise<string | null>;
  writeText(key: string, content: string, contentType?: string): Promise<void>;
  readBytes(key: string): Promise<Buffer | null>;
  writeBytes(key: string, content: Buffer, contentType?: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  /** List file names (not full keys) directly under prefix. Trailing slash optional. */
  listNames(prefix: string): Promise<string[]>;
  /** List full relative keys under prefix (recursive). */
  listKeys(prefix: string): Promise<string[]>;
}

function normalizeKey(key: string): string {
  return key.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function joinKey(...parts: string[]): string {
  return normalizeKey(parts.filter(Boolean).join("/"));
}

export class LocalDataFs implements DataFs {
  constructor(private readonly rootDir: string) {}

  private abs(key: string): string {
    const rel = normalizeKey(key);
    const full = path.resolve(this.rootDir, ...rel.split("/"));
    const root = path.resolve(this.rootDir);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error(`Path escapes data root: ${key}`);
    }
    return full;
  }

  async readText(key: string): Promise<string | null> {
    try {
      return await readFile(this.abs(key), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async writeText(key: string, content: string): Promise<void> {
    const full = this.abs(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }

  async readBytes(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.abs(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async writeBytes(key: string, content: Buffer, contentType?: string): Promise<void> {
    void contentType;
    const full = this.abs(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }

  async delete(key: string): Promise<boolean> {
    try {
      await rm(this.abs(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async listNames(prefix: string): Promise<string[]> {
    const dirKey = normalizeKey(prefix).replace(/\/$/, "");
    const dir = dirKey ? this.abs(dirKey) : path.resolve(this.rootDir);
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async listKeys(prefix: string): Promise<string[]> {
    const names = await this.listNames(prefix);
    const base = normalizeKey(prefix).replace(/\/$/, "");
    return names.map((name) => (base ? joinKey(base, name) : name));
  }
}

export class S3DataFs implements DataFs {
  private client: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly prefix: string,
    config: S3ClientConfig,
  ) {
    this.client = new S3Client(config);
  }

  private objectKey(key: string): string {
    const rel = normalizeKey(key);
    const base = normalizeKey(this.prefix);
    return base ? joinKey(base, rel) : rel;
  }

  private toRelative(objectKey: string): string {
    const base = normalizeKey(this.prefix);
    const key = normalizeKey(objectKey);
    if (!base) return key;
    if (key === base) return "";
    if (key.startsWith(base + "/")) return key.slice(base.length + 1);
    return key;
  }

  async readText(key: string): Promise<string | null> {
    const buf = await this.readBytes(key);
    return buf ? buf.toString("utf8") : null;
  }

  async writeText(key: string, content: string, contentType = "application/json"): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: content,
        ContentType: contentType,
      }),
    );
  }

  async readBytes(key: string): Promise<Buffer | null> {
    try {
      const out = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
        }),
      );
      if (!out.Body) return null;
      const bytes = await out.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      const name = (error as { name?: string }).name;
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (name === "NoSuchKey" || name === "NotFound" || status === 404) return null;
      throw error;
    }
  }

  async writeBytes(key: string, content: Buffer, contentType = "application/octet-stream"): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: content,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
        }),
      );
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) return false;
      throw error;
    }
  }

  async listNames(prefix: string): Promise<string[]> {
    const keys = await this.listKeys(prefix);
    const base = normalizeKey(prefix).replace(/\/$/, "");
    const names: string[] = [];
    for (const key of keys) {
      const rest = base ? key.slice(base.length).replace(/^\//, "") : key;
      if (!rest || rest.includes("/")) continue;
      names.push(rest);
    }
    return names;
  }

  async listKeys(prefix: string): Promise<string[]> {
    const dir = normalizeKey(prefix).replace(/\/$/, "");
    const s3Prefix = this.objectKey(dir ? `${dir}/` : "");
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const out = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: s3Prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of out.Contents ?? []) {
        if (!obj.Key || obj.Key.endsWith("/")) continue;
        keys.push(this.toRelative(obj.Key));
      }
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
}

let cached: DataFs | null = null;

export function usesS3Storage(): boolean {
  return appConfig.storage.backend === "s3";
}

export function createDataFs(): DataFs {
  if (appConfig.storage.backend === "s3") {
    const { bucket, region, accessKeyId, secretAccessKey, prefix, endpoint } = appConfig.storage.s3;
    if (!bucket) throw new Error("STORAGE_BACKEND=s3 requires AWS_S3_BUCKET");
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("STORAGE_BACKEND=s3 requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
    }
    const config: S3ClientConfig = {
      region: region || "eu-north-1",
      credentials: { accessKeyId, secretAccessKey },
    };
    if (endpoint) {
      config.endpoint = endpoint;
      config.forcePathStyle = true;
    }
    return new S3DataFs(bucket, prefix, config);
  }
  return new LocalDataFs(appConfig.dataDir);
}

export function getDataFs(): DataFs {
  if (!cached) cached = createDataFs();
  return cached;
}

/** Test helper */
export function resetDataFsCache(): void {
  cached = null;
}

export { joinKey, normalizeKey };
