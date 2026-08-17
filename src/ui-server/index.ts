import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../config";
import { ContentBriefSchema } from "../models";
import { createOrchestrator } from "../pipeline";
import { logger } from "../services/logger";
import { getTemplateStore, uploadTemplate } from "../services/templates";
import { discoverTopicRecommendations } from "../services/topic-discovery";
import { discoverTechDigest } from "../services/tech-digest";
import { getTopicStore } from "../services/topic-store";
import { ensureLlmSettings, getResolvedLlmConfig, publicLlmStatus, saveLlmSettings } from "../services/llm-settings";
import {
  authenticateUser,
  clearLoginFailures,
  clearSessionCookieHeader,
  clientIp,
  createUser,
  ensureSeedUser,
  getUserStore,
  loginRateLimited,
  sessionCookieHeader,
  sessionFromRequest,
  signSession,
  type SessionUser,
} from "../services/auth";
import { getActivityLogStore, recordActivity } from "../services/activity-log";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const publicCandidates = [
  path.join(moduleDir, "public"),
  path.join(process.cwd(), "public"),
  path.join(process.cwd(), "src/ui-server/public"),
];

/** Explicit URLs so Vercel file tracing includes these assets in the function bundle. */
const tracedStatic = {
  "/": new URL("./public/index.html", import.meta.url),
  "/index.html": new URL("./public/index.html", import.meta.url),
  "/settings": new URL("./public/index.html", import.meta.url),
  "/settings/": new URL("./public/index.html", import.meta.url),
  "/styles.css": new URL("./public/styles.css", import.meta.url),
  "/app.js": new URL("./public/app.js", import.meta.url),
} as const;

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

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

function isPublicAuthPath(method: string, pathname: string): boolean {
  if (pathname === "/api/auth/me" && method === "GET") return true;
  if (pathname === "/api/auth/login" && method === "POST") return true;
  if (pathname === "/api/auth/setup" && method === "POST") return true;
  return false;
}

async function serveStatic(res: ServerResponse, urlPath: string) {
  if (urlPath === "/settings" || urlPath === "/settings/") {
    urlPath = "/";
  }
  const traced = tracedStatic[urlPath as keyof typeof tracedStatic];
  if (traced) {
    try {
      const data = await readFile(traced);
      const ext = path.extname(traced.pathname);
      const headers: Record<string, string> = {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
      };
      if (ext === ".html") headers["Cache-Control"] = "no-store";
      res.writeHead(200, headers);
      res.end(data);
      return;
    } catch {
      // fall through to path candidates
    }
  }

  const rel = urlPath === "/" ? "/index.html" : urlPath;
  for (const publicDir of publicCandidates) {
    const root = path.normalize(publicDir);
    const filePath = path.normalize(path.join(root, rel));
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      continue;
    }
    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath);
      const headers: Record<string, string> = {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
      };
      if (ext === ".html") headers["Cache-Control"] = "no-store";
      res.writeHead(200, headers);
      res.end(data);
      return;
    } catch {
      // try next candidate
    }
  }
  res.writeHead(404).end("Not found");
}

function orch() {
  return createOrchestrator();
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method ?? "GET";
  const pathname = url.pathname;
  const ip = clientIp(req);

  try {
    await ensureSeedUser();
    await ensureLlmSettings();

    if (method === "GET" && pathname === "/api/auth/me") {
      const session = sessionFromRequest(req);
      const setupRequired = (await getUserStore().count()) === 0;
      return sendJson(res, 200, {
        authenticated: Boolean(session),
        username: session?.username ?? null,
        setupRequired,
      });
    }

    if (method === "POST" && pathname === "/api/auth/setup") {
      if ((await getUserStore().count()) > 0) {
        return sendJson(res, 409, { error: "An account already exists. Sign in instead." });
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const created = await createUser(String(body.username ?? ""), String(body.password ?? ""));
      const token = signSession(created.username);
      await recordActivity({
        username: created.username,
        action: "account_setup",
        method,
        path: pathname,
        ip,
      });
      return sendJson(res, 201, { username: created.username }, {
        "Set-Cookie": sessionCookieHeader(token, req),
      });
    }

    if (method === "POST" && pathname === "/api/auth/login") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const username = String(body.username ?? "");
      const rateKey = `${ip}:${username.trim().toLowerCase()}`;
      if (loginRateLimited(rateKey)) {
        await recordActivity({
          username: username.trim().toLowerCase() || null,
          action: "login_blocked",
          method,
          path: pathname,
          ip,
        });
        return sendJson(res, 429, { error: "Too many sign-in attempts. Try again in 15 minutes." });
      }
      try {
        const user = await authenticateUser(username, String(body.password ?? ""));
        clearLoginFailures(rateKey);
        const token = signSession(user.username);
        await recordActivity({
          username: user.username,
          action: "login",
          method,
          path: pathname,
          ip,
        });
        return sendJson(res, 200, { username: user.username }, {
          "Set-Cookie": sessionCookieHeader(token, req),
        });
      } catch (error) {
        await recordActivity({
          username: username.trim().toLowerCase() || null,
          action: "login_failed",
          method,
          path: pathname,
          ip,
        });
        const message = error instanceof Error ? error.message : "Invalid username or password";
        return sendJson(res, 401, { error: message });
      }
    }

    if (method === "POST" && pathname === "/api/auth/logout") {
      const session = sessionFromRequest(req);
      await recordActivity({
        username: session?.username ?? null,
        action: "logout",
        method,
        path: pathname,
        ip,
      });
      return sendJson(res, 200, { ok: true }, {
        "Set-Cookie": clearSessionCookieHeader(req),
      });
    }

    if (!isPublicAuthPath(method, pathname)) {
      const session = sessionFromRequest(req);
      if (!session) {
        return sendJson(res, 401, { error: "Sign in required" });
      }
      return handleAuthedApi(req, res, url, session, ip);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("API error", { path: pathname, error: message });
    return sendJson(res, 400, { error: message });
  }
}

async function handleAuthedApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  session: SessionUser,
  ip: string,
) {
  const method = req.method ?? "GET";
  const pathname = url.pathname;
  const log = (action: string, details?: Record<string, unknown>) =>
    recordActivity({
      username: session.username,
      action,
      method,
      path: pathname,
      ip,
      details,
    });

  try {
    if (method === "GET" && pathname === "/api/logs") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 80;
      const entries = await getActivityLogStore().list(Number.isFinite(limit) ? limit : 80);
      return sendJson(res, 200, { entries });
    }

    if (method === "GET" && pathname === "/api/auth/users") {
      const users = await getUserStore().list();
      return sendJson(res, 200, { users });
    }

    if (method === "POST" && pathname === "/api/auth/users") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const created = await createUser(String(body.username ?? ""), String(body.password ?? ""));
      await recordActivity({
        username: session.username,
        action: "user_created",
        method,
        path: pathname,
        ip,
        details: { createdUsername: created.username },
      });
      return sendJson(res, 201, created);
    }

    if (method === "GET" && pathname === "/api/health") {
      const llm = getResolvedLlmConfig();
      return sendJson(res, 200, {
        ok: true,
        storage: appConfig.storage.backend,
        llmProvider: llm.provider,
        llmModel: llm.model,
        researchProvider: appConfig.research.provider,
        hasLlmKey: Boolean(llm.apiKey),
        hasSpanwrapKey: Boolean(appConfig.spanwrap.apiKey),
        trendsSources: appConfig.trends.sources,
        hasGithubToken: Boolean(appConfig.trends.githubToken),
        hasRedditOAuth: Boolean(appConfig.trends.redditClientId && appConfig.trends.redditClientSecret),
        hasXBearer: Boolean(appConfig.trends.xBearerToken),
      });
    }

    if (method === "GET" && pathname === "/api/llm") {
      return sendJson(res, 200, publicLlmStatus());
    }

    if (method === "POST" && pathname === "/api/llm") {
      const body = JSON.parse((await readBody(req)) || "{}");
      await saveLlmSettings({
        provider: body.provider,
        model: body.model,
        apiKey: body.apiKey,
        baseUrl: body.baseUrl,
      });
      await log("llm_settings_saved", { provider: body.provider, model: body.model });
      return sendJson(res, 200, publicLlmStatus());
    }

    if ((pathname === "/api/digest" || pathname === "/api/topics/digest" || pathname === "/api/trending") && method === "GET") {
      const offline = url.searchParams.get("offline") === "1" || process.env.TRENDS_OFFLINE === "1";
      const limitRaw = url.searchParams.get("limit");
      const digest = await discoverTechDigest({
        offline,
        refresh: url.searchParams.get("refresh") === "1",
        limit: limitRaw ? Number.parseInt(limitRaw, 10) : undefined,
      });
      return sendJson(res, 200, digest);
    }

    if ((pathname === "/api/digest" || pathname === "/api/topics/digest" || pathname === "/api/trending") && method === "POST") {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      const offline = body.offline === true || process.env.TRENDS_OFFLINE === "1";
      const digest = await discoverTechDigest({
        offline,
        refresh: body.refresh === true,
        limit: typeof body.limit === "number" ? body.limit : undefined,
      });
      if (body.refresh === true) await log("digest_refreshed");
      return sendJson(res, 200, digest);
    }

    if (pathname === "/api/digest/start-run" && method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const title = String(body.title ?? "").trim();
      if (title.length < 3) {
        return sendJson(res, 400, { error: "title is required" });
      }
      const description = String(body.description ?? "").trim();
      const sourceUrl = typeof body.url === "string" && body.url.startsWith("http") ? body.url : null;
      const extraKeywords = description
        .split(/\s+/)
        .map((w) => w.replace(/[^a-zA-Z0-9-]/g, ""))
        .filter((w) => w.length > 3)
        .slice(0, 5);
      const brief = ContentBriefSchema.parse({
        topic: title.slice(0, 140),
        targetAudience: body.targetAudience ?? "startup founders and product teams",
        tone: body.tone ?? "technical but easy to understand",
        contentType: "educational",
        keywords: ["AI", "machine learning", "technology", ...extraKeywords],
        referenceUrls: sourceUrl ? [sourceUrl] : [],
      });
      const run = await orch().create(brief, { templateId: body.templateId || null });
      await log("run_created", { runId: run.id, topic: run.brief.topic, source: "digest" });
      return sendJson(res, 201, { run });
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
        await log("topics_discovered", { count: saved.length });
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
        await log("run_created", { runId: run.id, topic: run.brief.topic, source: "topic" });
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
      await log("run_created", { runId: run.id, topic: run.brief.topic });
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
          chars: t.markdown.length,
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
      await log("template_saved", {
        templateId: template.id,
        name: template.name,
        chars: template.markdown.length,
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
        if (ok) await log("template_deleted", { templateId: tid });
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
          case "save-review":
            run = await o.saveReview(id, {
              article: body.article,
              publishTargets: body.publishTargets,
            });
            break;
          case "assign-template":
            run = await o.assignTemplate(id, body.templateId ?? null);
            break;
          default:
            return sendJson(res, 404, { error: `Unknown action: ${action}` });
        }
        const actionNames: Record<string, string> = {
          research: "run_research",
          outline: "run_outline",
          generate: "run_generate",
          "quality-check": "run_quality",
          run: "run_started",
          approve: "run_approved",
          reject: "run_rejected",
          publish: "run_published",
          cancel: "run_cancelled",
          "outline-update": "outline_edited",
          "article-update": "article_edited",
          "save-review": "review_saved",
          "assign-template": "template_assigned",
        };
        await log(actionNames[action] ?? `run_${action}`, {
          runId: id,
          status: run.status,
        });
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

export function createUiServer() {
  const host = appConfig.ui.host;
  const port = appConfig.ui.port;

  return createServer((req, res) => {
    void (async () => {
      try {
        const forwardedProto = req.headers["x-forwarded-proto"];
        const proto =
          (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ===
          "https"
            ? "https"
            : "http";
        const origin = req.headers.host
          ? `${proto}://${req.headers.host}`
          : `http://${host}:${port}`;
        const url = new URL(req.url ?? "/", origin);
        if (url.pathname.startsWith("/api/")) {
          await handleApi(req, res, url);
          return;
        }
        await serveStatic(res, url.pathname);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Unhandled request error", { error: message });
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Internal Server Error");
        }
      }
    })();
  });
}

export function startUiServer() {
  const host = appConfig.ui.host;
  const port = appConfig.ui.port;
  const server = createUiServer();

  server.listen(port, host, () => {
    logger.info("Pipeline UI listening", {
      url: `http://${host}:${port}`,
      storage: appConfig.storage.backend,
    });
    console.log(`\nPipeline UI → http://${host}:${port}\n`);
  });

  return server;
}
