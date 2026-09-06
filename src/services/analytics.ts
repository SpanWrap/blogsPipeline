import { getDataFs } from "./data-fs";
import { logger } from "./logger";
import { withRetry } from "../utils/retry";

export type PostAnalytics = {
  runId: string;
  publishedAt: string;
  views: number;
  reads: number;
  likes: number;
  comments: number;
  shares: number;
  estimatedRevenue: number;
  topReferrers: string[];
  platform: string;
  externalId?: string;
  updatedAt: string;
};

function analyticsKey(runId: string): string {
  return `analytics/${runId}.json`;
}

async function readRecord(runId: string): Promise<PostAnalytics | null> {
  try {
    const raw = await getDataFs().readText(analyticsKey(runId));
    if (!raw) return null;
    return JSON.parse(raw) as PostAnalytics;
  } catch {
    return null;
  }
}

async function writeRecord(record: PostAnalytics): Promise<void> {
  await getDataFs().writeText(analyticsKey(record.runId), JSON.stringify(record, null, 2));
}

async function listAllRecords(): Promise<PostAnalytics[]> {
  const names = await getDataFs().listNames("analytics");
  const out: PostAnalytics[] = [];
  for (const f of names) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await getDataFs().readText(`analytics/${f}`);
      if (!raw) continue;
      out.push(JSON.parse(raw) as PostAnalytics);
    } catch {
      // skip
    }
  }
  return out;
}

export async function recordPublish(
  runId: string,
  platform: string,
  externalId?: string,
): Promise<PostAnalytics> {
  const record: PostAnalytics = {
    runId,
    publishedAt: new Date().toISOString(),
    views: 0,
    reads: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    estimatedRevenue: 0,
    topReferrers: [],
    platform,
    externalId,
    updatedAt: new Date().toISOString(),
  };
  await writeRecord(record);
  logger.info("Recorded publish", { runId, platform });
  return record;
}

export async function fetchAnalytics(runId: string): Promise<PostAnalytics | null> {
  return readRecord(runId);
}

export async function fetchMediumStats(
  externalId: string,
): Promise<Partial<PostAnalytics> | null> {
  try {
    const res = await withRetry(
      async () => {
        const r = await fetch(`https://medium.com/stats/${externalId}`, {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) throw Object.assign(new Error(`Medium ${r.status}`), { status: r.status });
        return r;
      },
      { maxAttempts: 2 },
    );
    const data = (await res.json()) as Record<string, unknown>;
    return {
      views: (data.views as number) ?? 0,
      reads: (data.reads as number) ?? 0,
      likes: (data.claps as number) ?? 0,
    };
  } catch (err) {
    logger.warn("Failed to fetch Medium stats", { externalId, error: String(err) });
    return null;
  }
}

export async function fetchDevtoStats(
  articleId: string | number,
): Promise<Partial<PostAnalytics> | null> {
  try {
    const res = await withRetry(
      async () => {
        const r = await fetch(`https://dev.to/api/articles/${articleId}`);
        if (!r.ok) throw Object.assign(new Error(`Dev.to ${r.status}`), { status: r.status });
        return r;
      },
      { maxAttempts: 2 },
    );
    const data = (await res.json()) as Record<string, unknown>;
    return {
      views: (data.page_views_count as number) ?? 0,
      likes: (data.positive_reactions_count as number) ?? 0,
      comments: (data.comments_count as number) ?? 0,
    };
  } catch (err) {
    logger.warn("Failed to fetch Dev.to stats", { articleId: String(articleId), error: String(err) });
    return null;
  }
}

async function updateRecord(record: PostAnalytics): Promise<PostAnalytics> {
  let stats: Partial<PostAnalytics> | null = null;

  if (record.platform === "medium" && record.externalId) {
    stats = await fetchMediumStats(record.externalId);
  } else if (record.platform === "devto" && record.externalId) {
    stats = await fetchDevtoStats(record.externalId);
  }

  if (stats) {
    Object.assign(record, stats, { updatedAt: new Date().toISOString() });
    await writeRecord(record);
  }
  return record;
}

export async function updateAllAnalytics(): Promise<PostAnalytics[]> {
  const records = await listAllRecords();
  logger.info("Updating analytics for all published posts", { count: records.length });
  const updated = await Promise.all(records.map(updateRecord));
  return updated;
}

export async function getTopPerformers(limit = 10): Promise<PostAnalytics[]> {
  return (await listAllRecords())
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

export async function getRevenueReport(dateRange?: {
  from: string;
  to: string;
}): Promise<{ totalRevenue: number; posts: PostAnalytics[] }> {
  let records = await listAllRecords();
  if (dateRange) {
    const from = new Date(dateRange.from).getTime();
    const to = new Date(dateRange.to).getTime();
    records = records.filter((r) => {
      const t = new Date(r.publishedAt).getTime();
      return t >= from && t <= to;
    });
  }
  const totalRevenue = records.reduce((sum, r) => sum + r.estimatedRevenue, 0);
  return { totalRevenue, posts: records };
}

export async function feedbackSignal(runId: string): Promise<number> {
  const record = await readRecord(runId);
  if (!record) return 0;

  const daysSincePublish = Math.max(
    1,
    (Date.now() - new Date(record.publishedAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  const viewsPerDay = record.views / daysSincePublish;
  const engagement =
    record.likes * 2 + record.comments * 3 + record.shares * 5 + record.reads * 0.5;
  const engagementPerDay = engagement / daysSincePublish;

  const viewScore = Math.min(50, viewsPerDay * 2);
  const engagementScore = Math.min(50, engagementPerDay);

  return Math.round(Math.min(100, viewScore + engagementScore));
}
