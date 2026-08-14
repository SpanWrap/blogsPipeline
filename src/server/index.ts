import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "@/config";
import { ContentBriefSchema } from "@/models";
import { createOrchestrator } from "@/pipeline";
import { logger } from "@/services/logger";
import { getTemplateStore, uploadTemplate } from "@/services/templates";
import { discoverTopicRecommendations } from "@/services/topic-discovery";
import { getTopicStore } from "@/services/topic-store";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function serveStatic(res: ServerResponse, urlPath: string) {
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(publicDir, rel));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

function orch() {
  return createOrchestrator();
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method ?? "GET";
  const pathname = url.pathname;

  try {
    if (method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        storage: appConfig.storage.backend,
        llmProvider:
          appConfig.llm.provider === "auto"
            ? appConfig.llm.apiKey
              ? /groq\.com/i.test(appConfig.llm.baseUrl)
                ? "groq"
                : "openai-compatible"
              : "mock"
            : appConfig.llm.provider,
        llmModel: appConfig.llm.model,
        researchProvider: appConfig.research.provider,
        hasLlmKey: Boolean(appConfig.llm.apiKey),
        hasSpanwrapKey: Boolean(appConfig.spanwrap.apiKey),
        trendsSources: appConfig.trends.sources,
      });
    }

    // Hot topic discovery
    if (pathname === "/api/topics" && method === "GET") {
      const topics = await getTopicStore().list();
      return sendJson(res, 200, topics);
    }

    if (pathname === "/api/topics/discover" && method === "POST") {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const offline = body.offline === true || process.env.TRENDS_OFFLINE === "1";
      const topics = await discoverTopicRecommendations({
        offline,
        limit: typeof body.limit === "number" ? body.limit : undefined,
        subreddits: Array.isArray(body.subreddits) ? body.subreddits : undefined,
      });
      try {
        const saved = await getTopicStore().saveMany(topics);
        return sendJson(res, 200, { count: saved.length, topics: saved });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Surface storage auth problems clearly (trends discovery itself succeeded)
        throw new Error(
          message.includes("MongoDB")
            ? message
            : `Failed to save topics to storage: ${message}`,
        );
      }
    }

    const topicMatch = pathname.match(/^\/api\/topics\/([^/]+)(?:\/(start-run))?$/);
    if (topicMatch) {
      const tid = decodeURIComponent(topicMatch[1]!);
      const action = topicMatch[2];
      if (method === "GET" && !action) {
        const topic = await getTopicStore().require(tid);
        return sendJson(res, 200, topic);
      }
      if (method === "POST" && action === "start-run") {
        const topic = await getTopicStore().require(tid);
        const bodyText = await readBody(req);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const brief = ContentBriefSchema.parse({
          topic: topic.topic,
          targetAudience: body.targetAudience ?? "startup founders and product teams",
          tone: body.tone ?? "technical but easy to understand",
          contentType: "educational",
          keywords: topic.keywords.length
            ? topic.keywords
            : topic.topic.split(/\s+/).slice(0, 5),
          referenceUrls: topic.signals
            .map((s) => s.url)
            .filter((u): u is string => Boolean(u))
            .slice(0, 5),
        });
        const run = await orch().create(brief, {
          templateId: body.templateId || null,
        });
        return sendJson(res, 201, { topic, run });
      }
    }

    if (method === "GET" && pathname === "/api/runs") {
      const runs = await orch().list();
      return sendJson(
        res,
        200,
        runs.map((r) => ({
          id: r.id,
          status: r.status,
          topic: r.brief.topic,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
          qualityScore: r.quality?.score ?? null,
          error: r.error,
        })),
      );
    }

    if (method === "POST" && pathname === "/api/runs") {
      const raw = JSON.parse((await readBody(req)) || "{}");
      const brief = ContentBriefSchema.parse({
        topic: raw.topic,
        targetAudience: raw.targetAudience ?? "general readers",
        tone: raw.tone ?? "clear and professional",
        contentType: raw.contentType ?? "educational",
        keywords: Array.isArray(raw.keywords)
          ? raw.keywords
          : typeof raw.keywords === "string"
            ? raw.keywords
                .split(",")
                .map((k: string) => k.trim())
                .filter(Boolean)
            : [],
        referenceUrls: Array.isArray(raw.referenceUrls) ? raw.referenceUrls : [],
      });
      const run = await orch().create(brief, {
        templateId: raw.templateId || null,
      });
      return sendJson(res, 201, run);
    }

    // Templates API
    if (pathname === "/api/templates" && method === "GET") {
      const list = await getTemplateStore().list();
      return sendJson(
        res,
        200,
        list.map((t) => ({
          id: t.id,
          name: t.name,
          filename: t.filename,
          updatedAt: t.updatedAt,
          createdAt: t.createdAt,
          notes: t.notes,
          preview: t.markdown.slice(0, 200),
        })),
      );
    }

    if (pathname === "/api/templates" && method === "POST") {
      const raw = JSON.parse((await readBody(req)) || "{}");
      const template = await uploadTemplate({
        name: raw.name ?? raw.filename ?? "Untitled template",
        markdown: raw.markdown ?? "",
        filename: raw.filename,
        notes: raw.notes ?? null,
      });
      return sendJson(res, 201, template);
    }

    const tplMatch = pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (tplMatch) {
      const tid = decodeURIComponent(tplMatch[1]!);
      if (method === "GET") {
        const t = await getTemplateStore().require(tid);
        return sendJson(res, 200, t);
      }
      if (method === "DELETE") {
        const ok = await getTemplateStore().delete(tid);
        return sendJson(res, ok ? 200 : 404, { deleted: ok });
      }
    }

    const runMatch = pathname.match(/^\/api\/runs\/([^/]+)(?:\/([^/]+))?$/);
    if (runMatch) {
      const id = decodeURIComponent(runMatch[1]!);
      const action = runMatch[2];

      if (method === "GET" && !action) {
        const run = await orch().get(id);
        return sendJson(res, 200, run);
      }

      if (method === "POST" && action) {
        const bodyText = await readBody(req);
        const body = bodyText ? JSON.parse(bodyText) : {};
        const o = orch();
        let run;
        switch (action) {
          case "research":
            run = await o.research(id);
            break;
          case "outline":
            run = await o.outline(id);
            break;
          case "generate":
            run = await o.generate(id);
            break;
          case "quality-check":
            run = await o.qualityCheck(id);
            break;
          case "run":
            run = await o.runUntilReview(id);
            break;
          case "approve":
            run = await o.approve(id, body.notes);
            break;
          case "reject":
            run = await o.reject(id, body.notes);
            break;
          case "publish":
            run = await o.publish(id);
            break;
          case "cancel":
            run = await o.cancel(id);
            break;
          case "outline-update":
            run = await o.updateOutline(id, body.outline ?? body);
            break;
          case "article-update":
            run = await o.updateArticle(id, body.article ?? body);
            break;
          case "assign-template":
            run = await o.assignTemplate(id, body.templateId ?? null);
            break;
          default:
            return sendJson(res, 404, { error: `Unknown action: ${action}` });
        }
        return sendJson(res, 200, run);
      }
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("API error", { path: pathname, error: message });
    return sendJson(res, 400, { error: message });
  }
}

export function startUiServer() {
  const host = appConfig.ui.host;
  const port = appConfig.ui.port;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, res, url);
    }
    return serveStatic(res, url.pathname);
  });

  server.listen(port, host, () => {
    logger.info("Pipeline UI listening", {
      url: `http://${host}:${port}`,
      storage: appConfig.storage.backend,
    });
    console.log(`\nPipeline UI → http://${host}:${port}\n`);
  });

  return server;
}

startUiServer();
