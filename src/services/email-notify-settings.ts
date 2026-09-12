import type { Collection, Document } from "mongodb";
import { appConfig } from "../config";
import { getDataFs } from "./data-fs";
import { connectMongo } from "./mongo-connection";

export type EmailNotifySettings = {
  /** When false, Autopilot skips Brevo emails even if API key is set. */
  enabled: boolean;
  /** Who receives Autopilot draft emails. */
  recipients: string[];
  updatedAt: string;
};

const SETTINGS_KEY = "email-notify-settings.json";
const SETTINGS_ID = "current";

let cache: EmailNotifySettings | null = null;
let loaded = false;
let mongoCol: Collection<Document> | null = null;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeRecipientList(raw: unknown): string[] {
  const list: string[] = [];
  const push = (v: unknown) => {
    const email = String(v ?? "")
      .trim()
      .toLowerCase();
    if (!email || !isEmail(email)) return;
    if (!list.includes(email)) list.push(email);
  };

  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  } else if (typeof raw === "string") {
    for (const part of raw.split(/[,;\s]+/)) push(part);
  }
  return list;
}

function defaultFromEnv(): EmailNotifySettings {
  return {
    enabled: appConfig.brevo.notifyEnabled,
    recipients: normalizeRecipientList(appConfig.brevo.defaultRecipients),
    updatedAt: new Date(0).toISOString(),
  };
}

function parseStored(raw: unknown): EmailNotifySettings | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const recipients = normalizeRecipientList(obj.recipients);
  return {
    enabled: obj.enabled === false ? false : true,
    recipients,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
  };
}

async function emailSettingsCollection(): Promise<Collection<Document> | null> {
  if (appConfig.storage.backend !== "mongodb" || !appConfig.storage.mongoUri) return null;
  if (mongoCol) return mongoCol;
  const { db } = await connectMongo(appConfig.storage.mongoUri, appConfig.storage.mongoDb);
  mongoCol = db.collection("email_notify_settings");
  return mongoCol;
}

async function loadStored(): Promise<EmailNotifySettings | null> {
  try {
    const col = await emailSettingsCollection();
    if (col) {
      const doc = await col.findOne({ _id: SETTINGS_ID as unknown as Document["_id"] });
      if (doc) return parseStored(doc);
    }
  } catch {
    /* fall through to file */
  }
  try {
    const raw = await getDataFs().readText(SETTINGS_KEY);
    if (!raw) return null;
    return parseStored(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeStored(settings: EmailNotifySettings): Promise<void> {
  const col = await emailSettingsCollection();
  if (col) {
    await col.updateOne(
      { _id: SETTINGS_ID as unknown as Document["_id"] },
      { $set: { ...settings, _id: SETTINGS_ID } },
      { upsert: true },
    );
    return;
  }
  await getDataFs().writeText(SETTINGS_KEY, JSON.stringify(settings, null, 2));
}

export async function getEmailNotifySettings(): Promise<EmailNotifySettings> {
  if (loaded && cache) return cache;
  const stored = await loadStored();
  const base = defaultFromEnv();
  cache = stored
    ? {
        enabled: stored.enabled,
        recipients: stored.recipients.length ? stored.recipients : base.recipients,
        updatedAt: stored.updatedAt,
      }
    : base;
  loaded = true;
  return cache;
}

export async function saveEmailNotifySettings(input: {
  enabled?: boolean;
  recipients?: unknown;
}): Promise<EmailNotifySettings> {
  const current = await getEmailNotifySettings();
  const next: EmailNotifySettings = {
    enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    recipients:
      input.recipients !== undefined
        ? normalizeRecipientList(input.recipients)
        : current.recipients,
    updatedAt: new Date().toISOString(),
  };
  await writeStored(next);
  cache = next;
  loaded = true;
  return next;
}

export function publicEmailNotifyStatus(settings: EmailNotifySettings) {
  return {
    enabled: settings.enabled,
    recipients: settings.recipients,
    updatedAt: settings.updatedAt,
    configured: Boolean(appConfig.brevo.apiKey && appConfig.brevo.senderEmail),
    hasApiKey: Boolean(appConfig.brevo.apiKey),
    senderEmail: appConfig.brevo.senderEmail || null,
    senderName: appConfig.brevo.senderName,
  };
}

/** Test helper */
export function resetEmailNotifySettingsCache(): void {
  cache = null;
  loaded = false;
  mongoCol = null;
}
