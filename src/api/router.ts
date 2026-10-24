import path from "node:path";
import { auth } from "../auth";
import { appConfig } from "../config";
import { ContentBriefSchema, type PipelineRun, type PublishTarget } from "../models";
import { createOrchestrator } from "../pipeline";
import { logger } from "../services/logger";
import { getTemplateStore, uploadTemplate } from "../services/templates";
import { discoverTopicRecommendations } from "../services/topic-discovery";
import { discoverTechDigest } from "../services/tech-digest";
import { getTopicStore } from "../services/topic-store";
import { ensureLlmSettings, getResolvedLlmConfig, publicLlmStatus, saveLlmSettings } from "../services/llm-settings";
import { getAutopilotScheduler, maybeStartAutopilotScheduler } from "../services/scheduler";
import { retryCycleEmail } from "../services/autopilot-email-retry";
import { getAutopilotLogStore } from "../services/autopilot-log";
import {
  effectivePermissions,
  hasAccess,
  normalizePermissions,
  requiredAccess,
  ROLE_PRESETS,
} from "../services/access";
import {
  createUser,
  deleteUser,
  ensureSeedUser,
  getUserStore,
  normalizeUsername,
  updateUserAccount,
  type SessionUser,
} from "../services/auth";
import { getActivityLogStore, recordActivity } from "../services/activity-log";
import { enrichRunView } from "../services/enrichment";
import { fetchAndExtract } from "../services/extraction";
import { clientIpFromHeaders } from "./session";
import { normalizeBriefUrls } from "../utils/url";
import { BACKGROUND_RUN_ACTIONS, runAfterResponse } from "./background";
import { isInFlightRun } from "../pipeline/state";

function runView(run: PipelineRun) {
  return { ...run, ...enrichRunView(run) };
}

function orch() {
  return createOrchestrator();
}

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function resolvePathname(request: Request, pathSegments?: string[]): string {
  if (pathSegments !== undefined) {
    return pathSegments.length === 0 ? "/api" : `/api/${pathSegments.join("/")}`;
  }
  return new URL(request.url).pathname;
}

function isPublicAuthPath(method: string, pathname: string): boolean {
  if (pathname === "/api/healthz" && method === "GET") return true;
  if (pathname === "/api/cron/autopilot" && method === "GET") return true;
  if (pathname === "/api/me" && method === "GET") return true;
  if (pathname === "/api/setup" && method === "POST") return true;
  return false;
}

function isVercelCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return typeof auth === "string" && auth === `Bearer ${secret}`;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return JSON.parse(text || "{}");
}

const bootFlag = globalThis as typeof globalThis & { __pipelineBoot?: boolean };

/** Call once per process. Starts the autopilot scheduler when enabled. */
export function ensureBoot(): void {
  // Instrumentation and the API route are separate bundles, so a module-local
  // flag would start two schedulers.
  if (bootFlag.__pipelineBoot) return;
  bootFlag.__pipelineBoot = true;
  maybeStartAutopilotScheduler();

  // Local restarts leave runs stuck mid-stage. Force age skip, but never steal an active lease.
  if (!process.env.VERCEL) {
    void createOrchestrator()
      .recoverInterruptedRuns({ force: true })
      .then((n) => {
        if (n > 0) logger.warn("Marked interrupted runs as failed on boot", { count: n });
      })
      .catch((error) => {
        logger.warn("Interrupted-run recovery failed on boot", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }
}

export async function handleApiRequest(
  request: Request,
  pathSegments?: string[],
): Promise<Response> {
  ensureBoot();

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = resolvePathname(request, pathSegments);
  const ip = clientIpFromHeaders(request.headers);

  try {
    if (method === "GET" && pathname === "/api/healthz") {
      return jsonResponse(200, {
        ok: true,
        vercel: Boolean(process.env.VERCEL),
        storage: appConfig.storage.backend,
      });
    }

    if (method === "GET" && pathname === "/api/cron/autopilot") {
      if (!isVercelCronRequest(request)) {
        return jsonResponse(401, { error: "Unauthorized" });
      }
      if (!appConfig.autopilot.enabled) {
        return jsonResponse(200, { ok: true, skipped: true, reason: "AUTOPILOT_ENABLED is false" });
      }
      try {
        const cycle = await getAutopilotScheduler().triggerNow();
        return jsonResponse(200, {
          ok: true,
          cycleId: cycle.id,
          created: cycle.runsCreated.length,
          published: cycle.runsPublished,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse(409, { error: message });
      }
    }

    await ensureSeedUser();
    await ensureLlmSettings();

    if (method === "GET" && pathname === "/api/me") {
      const nextSession = await auth();
      const username =
        nextSession?.user?.username || nextSession?.user?.name || null;
      const setupRequired = (await getUserStore().count()) === 0;
      let permissions = null;
      if (username) {
        const user = await getUserStore().get(username);
        if (user && user.active !== false) permissions = effectivePermissions(user);
      }
      return jsonResponse(200, {
        authenticated: Boolean(username),
        username,
        setupRequired,
        permissions,
      });
    }

    if (method === "POST" && pathname === "/api/setup") {
      if ((await getUserStore().count()) > 0) {
        return jsonResponse(409, { error: "An account already exists. Sign in instead." });
      }
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const created = await createUser(String(body.username ?? ""), String(body.password ?? ""));
      await recordActivity({
        username: created.username,
        action: "account_setup",
        method,
        path: pathname,
        ip,
      });
      return jsonResponse(201, { username: created.username });
    }

    if (!isPublicAuthPath(method, pathname)) {
      const nextSession = await auth();
      const username = nextSession?.user?.username || nextSession?.user?.name;
      if (!username) {
        return jsonResponse(401, { error: "Sign in required" });
      }
      return handleAuthedApi(request, url, pathname, { username }, ip);
    }

    return jsonResponse(404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("API error", { path: pathname, error: message });
    return jsonResponse(400, { error: message });
  }
}

async function handleAuthedApi(
  request: Request,
  url: URL,
  pathname: string,
  session: SessionUser,
  ip: string,
): Promise<Response> {
  const method = request.method.toUpperCase();
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
    const actor = await getUserStore().get(session.username);
    if (!actor || actor.active === false) {
      return jsonResponse(401, { error: "Sign in required" });
    }
    const need = requiredAccess(method, pathname);
    if (need && !hasAccess(actor, need.module, need.level)) {
      return jsonResponse(403, { error: "You don't have access to that" });
    }

    if (method === "GET" && pathname === "/api/logs") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 80;
      const entries = await getActivityLogStore().list(Number.isFinite(limit) ? limit : 80);
      return jsonResponse(200, { entries });
    }

    if (method === "GET" && pathname === "/api/users") {
      if (!hasAccess(actor, "people", "view")) {
        return jsonResponse(403, { error: "You don't have access to that" });
      }
      const users = await getUserStore().list();
      return jsonResponse(200, { users });
    }

    if (method === "POST" && pathname === "/api/users") {
      if (!hasAccess(actor, "people", "edit")) {
        return jsonResponse(403, { error: "You don't have access to that" });
      }
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const permissions = normalizePermissions(
        body.permissions === undefined ? ROLE_PRESETS.editor.permissions : body.permissions,
      );
      if (permissions.people === "full" && !hasAccess(actor, "people", "full")) {
        return jsonResponse(403, { error: "Only an administrator can create an administrator" });
      }
      const created = await createUser(String(body.username ?? ""), String(body.password ?? ""), permissions);
      await recordActivity({
        username: session.username,
        action: "user_created",
        method,
        path: pathname,
        ip,
        details: { createdUsername: created.username },
      });
      return jsonResponse(201, created);
    }

    const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && (method === "PATCH" || method === "DELETE")) {
      const target = normalizeUsername(decodeURIComponent(userMatch[1]!));
      const isSelf = target === normalizeUsername(session.username);
      const admin = hasAccess(actor, "people", "full");
      if (method === "DELETE") {
        if (!admin) return jsonResponse(403, { error: "You don't have access to that" });
        await deleteUser(session.username, target);
        await recordActivity({
          username: session.username,
          action: "user_deleted",
          method,
          path: pathname,
          ip,
          details: { createdUsername: target },
        });
        return jsonResponse(200, { deleted: true });
      }
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const wantsPassword = typeof body.password === "string" && body.password.length > 0;
      const wantsAccess = body.permissions !== undefined || typeof body.active === "boolean";
      if (!wantsPassword && !wantsAccess) {
        return jsonResponse(400, { error: "Nothing to update" });
      }
      if (wantsPassword && !isSelf && !admin) {
        return jsonResponse(403, { error: "You can only change your own password" });
      }
      if (wantsAccess && !admin) {
        return jsonResponse(403, { error: "You don't have access to that" });
      }
      const updated = await updateUserAccount(target, {
        password: wantsPassword ? String(body.password) : undefined,
        permissions: wantsAccess && body.permissions !== undefined ? body.permissions : undefined,
        active: wantsAccess && typeof body.active === "boolean" ? body.active : undefined,
      });
      await recordActivity({
        username: session.username,
        action: wantsPassword && !wantsAccess ? "user_password_changed" : "user_updated",
        method,
        path: pathname,
        ip,
        details: { createdUsername: target },
      });
      return jsonResponse(200, updated);
    }

    if (method === "GET" && pathname === "/api/health") {
      const llm = getResolvedLlmConfig();
      return jsonResponse(200, {
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
        hasGeminiKey: Boolean(appConfig.images.geminiApiKey),
        autoAcceptEnabled: appConfig.quality.autoAcceptEnabled,
        autoAcceptMinScore: appConfig.quality.autoAcceptMinScore,
      });
    }

    // ── Autopilot API ──

    if (method === "GET" && pathname === "/api/autopilot/status") {
      const scheduler = getAutopilotScheduler();
      const status = await scheduler.status();
      return jsonResponse(200, status);
    }

    if (method === "POST" && pathname === "/api/autopilot/trigger") {
      const scheduler = getAutopilotScheduler();
      const body = (await readJsonBody(request)) as {
        dryRun?: boolean;
        platforms?: PublishTarget[];
        postsPerPlatform?: number;
      };
      try {
        const cycle = await scheduler.triggerNow({
          dryRun: body.dryRun,
          platforms: body.platforms,
          postsPerPlatform: body.postsPerPlatform,
        });
        await log("autopilot_triggered", {
          cycleId: cycle.id,
          created: cycle.runsCreated.length,
          published: cycle.runsPublished,
        });
        return jsonResponse(200, cycle);
      } catch (error) {
        return jsonResponse(409, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (method === "POST" && pathname === "/api/autopilot/toggle") {
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const scheduler = getAutopilotScheduler();
      if (body.enabled) {
        scheduler.start();
      } else {
        scheduler.stop();
      }
      await log(body.enabled ? "autopilot_enabled" : "autopilot_disabled", {});
      return jsonResponse(200, await scheduler.status());
    }

    const retryEmailMatch = pathname.match(/^\/api\/autopilot\/cycles\/([^/]+)\/retry-email$/);
    if (method === "POST" && retryEmailMatch) {
      const cycleId = decodeURIComponent(retryEmailMatch[1] ?? "");
      try {
        const cycle = await retryCycleEmail(cycleId);
        await log("autopilot_email_retried", {
          cycleId,
          emailStatus: cycle.email?.status ?? null,
          queued: cycle.email?.queued ?? false,
        });
        return jsonResponse(200, cycle);
      } catch (error) {
        return jsonResponse(400, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (method === "GET" && pathname === "/api/autopilot/history") {
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Math.min(parseInt(limitRaw, 10), 50) : 20;
      const logStore = getAutopilotLogStore();
      const history = await logStore.list(limit);
      return jsonResponse(200, { cycles: history });
    }

    if (method === "GET" && pathname === "/api/autopilot/config") {
      return jsonResponse(200, appConfig.autopilot);
    }

    if (method === "GET" && pathname === "/api/reader-profiles") {
      const { getReaderProfileSettings, publicReaderProfiles } = await import(
        "../services/reader-profiles"
      );
      return jsonResponse(200, publicReaderProfiles(await getReaderProfileSettings()));
    }

    if (method === "POST" && pathname === "/api/reader-profiles") {
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const { saveReaderProfileSettings, publicReaderProfiles } = await import(
        "../services/reader-profiles"
      );
      const saved = await saveReaderProfileSettings({
        profiles: body.profiles,
        defaultProfileId: body.defaultProfileId,
      });
      await log("reader_profiles_saved", {
        count: saved.profiles.length,
        defaultProfileId: saved.defaultProfileId,
      });
      return jsonResponse(200, publicReaderProfiles(saved));
    }

    if (method === "GET" && pathname === "/api/email-notify") {
      const {
        getEmailNotifySettings,
        publicEmailNotifyStatus,
      } = await import("../services/email-notify-settings");
      const settings = await getEmailNotifySettings();
      return jsonResponse(200, publicEmailNotifyStatus(settings));
    }

    if (method === "POST" && pathname === "/api/email-notify") {
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const {
        saveEmailNotifySettings,
        publicEmailNotifyStatus,
      } = await import("../services/email-notify-settings");
      const saved = await saveEmailNotifySettings({
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        recipients: body.recipients,
      });
      await log("email_notify_settings_saved", {
        enabled: saved.enabled,
        recipients: saved.recipients.length,
      });
      return jsonResponse(200, publicEmailNotifyStatus(saved));
    }

    if (method === "POST" && pathname === "/api/email-notify/test") {
      const {
        getEmailNotifySettings,
      } = await import("../services/email-notify-settings");
      const { sendBrevoEmail } = await import("../providers/email/brevo");
      const settings = await getEmailNotifySettings();
      if (!settings.recipients.length) {
        return jsonResponse(400, { error: "Add at least one recipient first" });
      }
      if (!appConfig.brevo.apiKey || !appConfig.brevo.senderEmail) {
        return jsonResponse(400, {
          error: "Set BREVO_API_KEY and BREVO_SENDER_EMAIL in .env",
        });
      }
      const result = await sendBrevoEmail({
        to: settings.recipients.map((email) => ({ email })),
        subject: "[Pipeline] Brevo test email",
        htmlContent:
          "<p>Brevo is configured. Autopilot will attach finished drafts as <code>.md</code> files.</p>",
        textContent: "Brevo is configured. Autopilot will attach finished drafts as .md files.",
      });
      if (!result.ok) {
        return jsonResponse(502, { error: result.error || "Send failed", status: result.status });
      }
      await log("email_notify_test_sent", {
        recipients: settings.recipients.length,
        messageId: result.messageId,
      });
      return jsonResponse(200, { ok: true, messageId: result.messageId });
    }

    if (method === "GET" && pathname === "/api/llm") {
      return jsonResponse(200, publicLlmStatus());
    }

    if (method === "POST" && pathname === "/api/llm") {
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      await saveLlmSettings({
        provider: body.provider,
        model: body.model,
        apiKey: body.apiKey,
        baseUrl: body.baseUrl,
      });
      await log("llm_settings_saved", { provider: body.provider, model: body.model });
      return jsonResponse(200, publicLlmStatus());
    }

    if ((pathname === "/api/digest" || pathname === "/api/topics/digest" || pathname === "/api/trending") && method === "GET") {
      const offline = url.searchParams.get("offline") === "1" || process.env.TRENDS_OFFLINE === "1";
      const limitRaw = url.searchParams.get("limit");
      const digest = await discoverTechDigest({
        offline,
        refresh: url.searchParams.get("refresh") === "1",
        limit: limitRaw ? Number.parseInt(limitRaw, 10) : undefined,
      });
      return jsonResponse(200, digest);
    }

    if ((pathname === "/api/digest" || pathname === "/api/topics/digest" || pathname === "/api/trending") && method === "POST") {
      const bodyText = await request.text();
      const body = bodyText ? JSON.parse(bodyText) : {};
      const offline = body.offline === true || process.env.TRENDS_OFFLINE === "1";
      const digest = await discoverTechDigest({
        offline,
        refresh: body.refresh === true,
        limit: typeof body.limit === "number" ? body.limit : undefined,
      });
      if (body.refresh === true) await log("digest_refreshed");
      return jsonResponse(200, digest);
    }

    if (pathname === "/api/digest/start-run" && method === "POST") {
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      const title = String(body.title ?? "").trim();
      if (title.length < 3) {
        return jsonResponse(400, { error: "title is required" });
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
      const run = await orch().create(brief, { templateId: (body.templateId as string) || null });
      await log("run_created", { runId: run.id, topic: run.brief.topic, source: "digest" });
      return jsonResponse(201, { run });
    }

    // Hot topic discovery
    if (pathname === "/api/topics" && method === "GET") {
      const topics = await getTopicStore().list();
      return jsonResponse(200, topics);
    }

    if (pathname === "/api/topics/discover" && method === "POST") {
      const bodyText = await request.text();
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
        return jsonResponse(200, { count: saved.length, topics: saved });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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
        return jsonResponse(200, topic);
      }
      if (method === "POST" && action === "start-run") {
        const topic = await getTopicStore().require(tid);
        const bodyText = await request.text();
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
            .map((s: { url?: string | null }) => s.url)
            .filter((u: string | null | undefined): u is string => Boolean(u))
            .slice(0, 5),
        });
        const run = await orch().create(brief, {
          templateId: body.templateId || null,
        });
        await log("run_created", { runId: run.id, topic: run.brief.topic, source: "topic" });
        return jsonResponse(201, { topic, run });
      }
    }

    if (method === "GET" && pathname === "/api/runs") {
      const runs = await orch().list();
      return jsonResponse(
        200,
        runs.map((r) => ({
          id: r.id,
          status: r.status,
          topic: r.brief.topic,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
          qualityScore: r.quality?.score ?? null,
          error: r.error,
          failedStage: r.failedStage,
          retryable: r.retryable,
          autoAccepted: r.autoAccepted,
        })),
      );
    }

    if (method === "GET" && pathname === "/api/dashboard") {
      const runs = await orch().list();
      return jsonResponse(200, orch().getResumeDashboard(runs));
    }

    if (method === "GET" && pathname === "/api/style-presets") {
      const { STYLE_PRESETS } = await import("../services/style-presets");
      const { ensureTemplateMemory } = await import("../services/template-memory");
      return jsonResponse(200, { presets: STYLE_PRESETS, memory: await ensureTemplateMemory() });
    }

    if (method === "POST" && pathname === "/api/runs/batch") {
      const raw = (await readJsonBody(request)) as Record<string, unknown>;
      const topics = Array.isArray(raw.topics) ? raw.topics : [];
      if (!topics.length) return jsonResponse(400, { error: "topics array required" });
      const briefs = topics.slice(0, 8).map((t: unknown) =>
        ContentBriefSchema.parse({
          topic: String(t).slice(0, 140),
          targetAudience: raw.targetAudience ?? "startup founders",
          tone: raw.tone ?? "technical but easy to understand",
          contentType: "educational",
          keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
          stylePresetId: raw.stylePresetId ?? null,
          referenceUrls: [],
        }),
      );
      const runs = await orch().batchCreateAndRun(briefs, {
        generateImages: raw.generateImages === true,
        templateId: (raw.templateId as string) || null,
      });
      await log("runs_batch", { count: runs.length });
      return jsonResponse(201, { runs });
    }

    if (method === "POST" && pathname === "/api/runs") {
      const raw = (await readJsonBody(request)) as Record<string, unknown>;
      const sourceUrl =
        typeof raw.sourceUrl === "string"
          ? raw.sourceUrl
          : Array.isArray(raw.referenceUrls) && typeof raw.referenceUrls[0] === "string"
            ? raw.referenceUrls[0]
            : "";
      let { topic, referenceUrls } = normalizeBriefUrls({
        topic: typeof raw.topic === "string" ? raw.topic : "",
        sourceUrl,
        referenceUrls: Array.isArray(raw.referenceUrls)
          ? raw.referenceUrls.map(String)
          : sourceUrl
            ? [sourceUrl]
            : [],
      });

      // Prefer the live page title when the user grounded the run in a blog URL.
      if (referenceUrls[0] && (topic.length < 8 || /^https?:\/\//i.test(String(raw.topic ?? "")))) {
        try {
          const page = await fetchAndExtract(referenceUrls[0]);
          if (page.title && page.title.trim().length >= 3) {
            topic = page.title.trim().slice(0, 140);
          }
        } catch (error) {
          logger.warn("Could not prefetch source blog title", {
            url: referenceUrls[0],
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (topic.length < 3) {
        return jsonResponse(400, { error: "Topic or a valid source blog URL is required" });
      }

      const brief = ContentBriefSchema.parse({
        topic,
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
        referenceUrls,
        stylePresetId: raw.stylePresetId ?? null,
        competitorUrls: Array.isArray(raw.competitorUrls) ? raw.competitorUrls : [],
      });
      const run = await orch().create(brief, {
        templateId: (raw.templateId as string) || null,
      });
      await log("run_created", {
        runId: run.id,
        topic: run.brief.topic,
        referenceUrls: referenceUrls.length,
      });
      return jsonResponse(201, runView(run));
    }

    // Templates API
    if (pathname === "/api/templates" && method === "GET") {
      const list = await getTemplateStore().list();
      return jsonResponse(
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
      const raw = (await readJsonBody(request)) as Record<string, unknown>;
      const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : undefined;
      const template = await uploadTemplate({
        id,
        name: (raw.name as string) ?? (raw.filename as string) ?? "Untitled template",
        markdown: (raw.markdown as string) ?? "",
        filename: raw.filename as string | undefined,
        notes: (raw.notes as string | null) ?? null,
      });
      await log("template_saved", {
        templateId: template.id,
        name: template.name,
        chars: template.markdown.length,
        updated: Boolean(id),
      });
      return jsonResponse(id ? 200 : 201, template);
    }

    const tplMatch = pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (tplMatch) {
      const tid = decodeURIComponent(tplMatch[1]!);
      if (method === "GET") {
        const t = await getTemplateStore().require(tid);
        return jsonResponse(200, t);
      }
      if (method === "DELETE") {
        const ok = await getTemplateStore().delete(tid);
        if (ok) await log("template_deleted", { templateId: tid });
        return jsonResponse(ok ? 200 : 404, { deleted: ok });
      }
    }

    const imageMatch = pathname.match(/^\/api\/runs\/([^/]+)\/images\/([^/]+)$/);
    if (imageMatch && method === "GET") {
      const runId = decodeURIComponent(imageMatch[1]!);
      const filename = decodeURIComponent(imageMatch[2]!);
      if (!/^[\w.-]+$/.test(filename)) {
        return jsonResponse(400, { error: "Invalid image filename" });
      }
      const fileKey = `images/${runId}/${filename}`;
      try {
        const { getDataFs } = await import("../services/data-fs");
        const buf = await getDataFs().readBytes(fileKey);
        if (!buf) return jsonResponse(404, { error: "Image not found" });
        const ext = path.extname(filename).toLowerCase();
        const mime =
          ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : "image/jpeg";
        return new Response(new Uint8Array(buf), {
          status: 200,
          headers: {
            "Content-Type": mime,
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch {
        return jsonResponse(404, { error: "Image not found" });
      }
    }

    const runMatch = pathname.match(/^\/api\/runs\/([^/]+)(?:\/([^/]+))?$/);
    if (runMatch) {
      const id = decodeURIComponent(runMatch[1]!);
      const action = runMatch[2];

      if (method === "GET" && !action) {
        const run = await orch().get(id);
        return jsonResponse(200, runView(run));
      }

      if (method === "DELETE" && !action) {
        const ok = await orch().delete(id);
        if (ok) await log("run_deleted", { runId: id });
        return jsonResponse(ok ? 200 : 404, { deleted: ok });
      }

      if (method === "POST" && action) {
        const bodyText = await request.text();
        const body = bodyText ? JSON.parse(bodyText) : {};
        const o = orch();

        if (action === "generate-stream") {
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              const send = (event: string, data: unknown) => {
                controller.enqueue(
                  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
              };
              const ac = new AbortController();
              const onAbort = () => ac.abort();
              request.signal.addEventListener("abort", onAbort);
              try {
                send("status", { stage: "generation", message: "Streaming draft..." });
                const { markdown, run } = await o.streamDraft(
                  id,
                  async (chunk) => {
                    send("delta", { text: chunk });
                  },
                  ac.signal,
                );
                send("done", {
                  markdown,
                  runId: run.id,
                  status: run.status,
                });
                await log("run_generate_stream", { runId: id, chars: markdown.length });
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                try {
                  send("error", { error: message });
                } catch {
                  // controller may already be closed
                }
                await log("run_generate_stream_failed", { runId: id, error: message });
              } finally {
                request.signal.removeEventListener("abort", onAbort);
                try {
                  controller.close();
                } catch {
                  // already closed
                }
              }
            },
          });

          return new Response(stream, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            },
          });
        }

        if (BACKGROUND_RUN_ACTIONS.has(action)) {
          const current = await o.get(id);
          // Only skip re-dispatch when a worker is actually alive (local lock or lease).
          // Ghost QUALITY_CHECK/GENERATING rows (no lease after restart/aborted after())
          // used to return 202 forever, then get marked INTERRUPTED on the next poll.
          if (action === "run" && isInFlightRun(current) && o.isActivelyWorking(id, current)) {
            await log("run_started", { runId: id, status: current.status, resumed: true });
            return jsonResponse(202, { ...runView(current), accepted: true });
          }

          let accepted = current;
          if (action === "run") {
            accepted = await o.claimRunStart(id);
          }

          const generateImages = body.generateImages;
          const stopAfter = body.stopAfter === "outline" ? ("outline" as const) : null;
          const forceFull = body.forceFull === true;

          runAfterResponse(`${action}:${id}`, async () => {
            switch (action) {
              case "research":
                await o.research(id);
                break;
              case "outline":
                await o.outline(id);
                break;
              case "generate":
                await o.generate(id, { generateImages });
                break;
              case "quality-check":
                await o.qualityCheck(id);
                break;
              case "run":
                await o.runUntilReview(id, { generateImages, stopAfter, forceFull });
                break;
              case "accept-stream-draft":
                await o.acceptStreamDraft(id, String(body.markdown ?? ""), { generateImages });
                break;
              case "publish":
                await o.publish(id);
                break;
              case "push-destination":
                await o.publishDestination(id, String(body.destination ?? ""));
                break;
              case "generate-images":
                await o.generateImages(id);
                break;
              case "readability-pass":
                await o.readabilityPass(id);
                break;
              case "regenerate-section":
                await o.regenerateSection(id, String(body.heading ?? ""));
                break;
              case "regenerate-selection":
                await o.regenerateSelection(id, {
                  selectedText: String(body.selectedText ?? ""),
                  instruction: String(body.instruction ?? ""),
                  content: body.content != null ? String(body.content) : undefined,
                });
                break;
              case "refresh":
                await o.refreshPublished(id);
                break;
              case "distribute":
                await o.distribute(id);
                break;
              default:
                break;
            }
          });

          const bgNames: Record<string, string> = {
            research: "run_research",
            outline: "run_outline",
            generate: "run_generate",
            "quality-check": "run_quality",
            run: "run_started",
            "accept-stream-draft": "run_accept_stream_draft",
            publish: "run_published",
            "push-destination": "run_pushed",
            "generate-images": "run_generate_images",
            "readability-pass": "run_readability",
            "regenerate-section": "run_regen_section",
            "regenerate-selection": "run_regen_selection",
            refresh: "run_refresh",
            distribute: "run_distribute",
          };
          await log(bgNames[action] ?? `run_${action}`, {
            runId: id,
            status: accepted.status,
            accepted: true,
          });
          return jsonResponse(202, { ...runView(accepted), accepted: true });
        }

        let run;
        switch (action) {
          case "reject-stream-draft":
            run = await o.rejectStreamDraft(id, body.reason ? String(body.reason) : undefined);
            break;
          case "approve":
            run = await o.approve(id, body.notes);
            break;
          case "mark-distribution":
            run = await o.markDistribution(
              id,
              String(body.destination ?? ""),
              body.status === "not_sent" ? "not_sent" : "manual",
            );
            break;
          case "reject":
            run = await o.reject(id, body.notes);
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
          case "apply-seo":
            run = await o.applySeoPack(id, {
              title: body.title,
              description: body.description,
              slug: body.slug,
            });
            break;
          case "select-thumbnail":
            run = await o.selectThumbnail(id, String(body.variantId ?? ""));
            break;
          case "diff":
            return jsonResponse(200, await o.getDiff(id));
          case "sections":
            return jsonResponse(200, { sections: await o.listSections(id) });
          default:
            return jsonResponse(404, { error: `Unknown action: ${action}` });
        }
        const actionNames: Record<string, string> = {
          "reject-stream-draft": "run_reject_stream_draft",
          "apply-seo": "run_apply_seo",
          "select-thumbnail": "run_select_thumbnail",
          approve: "run_approved",
          "mark-distribution": "run_marked_uploaded",
          reject: "run_rejected",
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
        return jsonResponse(200, runView(run));
      }
    }

    return jsonResponse(404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("API error", { path: pathname, error: message });
    return jsonResponse(400, { error: message });
  }
}
