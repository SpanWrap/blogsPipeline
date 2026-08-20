import fs from "node:fs";
import path from "node:path";
import { appConfig } from "../config";
import { logger } from "./logger";
import { withRetry } from "../utils/retry";
function analyticsDir() {
    const dir = appConfig.analytics.dataDir;
    return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}
function filePath(runId) {
    return path.join(analyticsDir(), `${runId}.json`);
}
function ensureDir() {
    const dir = analyticsDir();
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
function readRecord(runId) {
    const fp = filePath(runId);
    if (!fs.existsSync(fp))
        return null;
    try {
        return JSON.parse(fs.readFileSync(fp, "utf-8"));
    }
    catch {
        return null;
    }
}
function writeRecord(record) {
    ensureDir();
    fs.writeFileSync(filePath(record.runId), JSON.stringify(record, null, 2));
}
function listAllRecords() {
    const dir = analyticsDir();
    if (!fs.existsSync(dir))
        return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
        try {
            return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
        }
        catch {
            return null;
        }
    })
        .filter((r) => r !== null);
}
export function recordPublish(runId, platform, externalId) {
    const record = {
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
    writeRecord(record);
    logger.info("Recorded publish", { runId, platform });
    return record;
}
export function fetchAnalytics(runId) {
    return readRecord(runId);
}
export async function fetchMediumStats(externalId) {
    try {
        const res = await withRetry(async () => {
            const r = await fetch(`https://medium.com/stats/${externalId}`, {
                headers: { Accept: "application/json" },
            });
            if (!r.ok)
                throw Object.assign(new Error(`Medium ${r.status}`), { status: r.status });
            return r;
        }, { maxAttempts: 2 });
        const data = (await res.json());
        return {
            views: data.views ?? 0,
            reads: data.reads ?? 0,
            likes: data.claps ?? 0,
        };
    }
    catch (err) {
        logger.warn("Failed to fetch Medium stats", { externalId, error: String(err) });
        return null;
    }
}
export async function fetchDevtoStats(articleId) {
    try {
        const res = await withRetry(async () => {
            const r = await fetch(`https://dev.to/api/articles/${articleId}`);
            if (!r.ok)
                throw Object.assign(new Error(`Dev.to ${r.status}`), { status: r.status });
            return r;
        }, { maxAttempts: 2 });
        const data = (await res.json());
        return {
            views: data.page_views_count ?? 0,
            likes: data.positive_reactions_count ?? 0,
            comments: data.comments_count ?? 0,
        };
    }
    catch (err) {
        logger.warn("Failed to fetch Dev.to stats", { articleId: String(articleId), error: String(err) });
        return null;
    }
}
async function updateRecord(record) {
    let stats = null;
    if (record.platform === "medium" && record.externalId) {
        stats = await fetchMediumStats(record.externalId);
    }
    else if (record.platform === "devto" && record.externalId) {
        stats = await fetchDevtoStats(record.externalId);
    }
    if (stats) {
        Object.assign(record, stats, { updatedAt: new Date().toISOString() });
        writeRecord(record);
    }
    return record;
}
export async function updateAllAnalytics() {
    const records = listAllRecords();
    logger.info("Updating analytics for all published posts", { count: records.length });
    const updated = await Promise.all(records.map(updateRecord));
    return updated;
}
export function getTopPerformers(limit = 10) {
    return listAllRecords()
        .sort((a, b) => b.views - a.views)
        .slice(0, limit);
}
export function getRevenueReport(dateRange) {
    let records = listAllRecords();
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
export function feedbackSignal(runId) {
    const record = readRecord(runId);
    if (!record)
        return 0;
    const daysSincePublish = Math.max(1, (Date.now() - new Date(record.publishedAt).getTime()) / (1000 * 60 * 60 * 24));
    const viewsPerDay = record.views / daysSincePublish;
    const engagement = record.likes * 2 + record.comments * 3 + record.shares * 5 + record.reads * 0.5;
    const engagementPerDay = engagement / daysSincePublish;
    // Normalize to 0-100 with diminishing returns
    const viewScore = Math.min(50, viewsPerDay * 2);
    const engagementScore = Math.min(50, engagementPerDay);
    return Math.round(Math.min(100, viewScore + engagementScore));
}
