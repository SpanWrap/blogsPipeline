"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./pipeline/api";
import { AuthGate } from "./pipeline/AuthGate";
import { LLM_PROVIDERS } from "./pipeline/constants";
import type { AppPage, HomeView } from "./pipeline/constants";
import { CreateRunView } from "./pipeline/CreateRunView";
import { LoadingScreen } from "./pipeline/LoadingScreen";
import { RunsView } from "./pipeline/RunsView";
import { SettingsView } from "./pipeline/SettingsView";
import { SidebarToggleIcon } from "./pipeline/SidebarToggleIcon";
import { Toast } from "./pipeline/Toast";
import { TopicsView } from "./pipeline/TopicsView";
import type {
  AutopilotCycle,
  AutopilotStatus,
  DashboardData,
  DigestData,
  DigestItem,
  HealthData,
  LlmConfig,
  LogEntry,
  ProgressLine,
  RunRecord,
  StylePreset,
  TemplateRecord,
  UserRecord,
} from "./pipeline/types";
import { normalizeBriefUrls } from "@/utils/url";
import { isInFlightRun } from "./pipeline/utils";

type PipelineAppProps = {
  initialPage?: AppPage;
};

const WORKSPACE_READY_KEY = "pipeline.workspaceReady";
const WORKSPACE_USER_KEY = "pipeline.username";

function readWorkspaceBoot(): { ready: boolean; username: string } {
  if (typeof window === "undefined") return { ready: false, username: "" };
  try {
    if (sessionStorage.getItem(WORKSPACE_READY_KEY) === "1") {
      return {
        ready: true,
        username: sessionStorage.getItem(WORKSPACE_USER_KEY) || "",
      };
    }
  } catch {
    /* ignore */
  }
  return { ready: false, username: "" };
}

function persistWorkspaceBoot(username: string) {
  try {
    sessionStorage.setItem(WORKSPACE_READY_KEY, "1");
    sessionStorage.setItem(WORKSPACE_USER_KEY, username);
  } catch {
    /* ignore */
  }
}

function clearWorkspaceBoot() {
  try {
    sessionStorage.removeItem(WORKSPACE_READY_KEY);
    sessionStorage.removeItem(WORKSPACE_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function PipelineApp({ initialPage = "home" }: PipelineAppProps) {
  const page: AppPage = initialPage === "settings" ? "settings" : "home";
  const { data: session, status: sessionStatus } = useSession();
  const boot0 = readWorkspaceBoot();
  const [authChecked, setAuthChecked] = useState(boot0.ready);
  const [authenticated, setAuthenticated] = useState(boot0.ready);
  const [setupRequired, setSetupRequired] = useState(false);
  const [username, setUsername] = useState(boot0.username);
  const [booting, setBooting] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(boot0.ready);
  const [homeView, setHomeView] = useState<HomeView>("runs");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const bootUserRef = useRef<string | null>(boot0.ready ? boot0.username || null : null);
  const bootInFlightRef = useRef(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [tab, setTab] = useState("article");
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [lastStylePresetId, setLastStylePresetId] = useState("");
  const [digest, setDigest] = useState<DigestData | null | "loading">(null);
  const [digestFilter, setDigestFilter] = useState("all");
  const [digestRefreshing, setDigestRefreshing] = useState(false);
  const digestRefreshSeq = useRef(0);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [generateImages, setGenerateImages] = useState(false);
  const [progress, setProgress] = useState<{
    active: boolean;
    action: string;
    lines: ProgressLine[];
  }>({ active: false, action: "", lines: [] });

  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthError, setHealthError] = useState<string | undefined>();
  const [llm, setLlm] = useState<LlmConfig>({
    provider: "groq",
    model: "openai/gpt-oss-20b",
    providers: LLM_PROVIDERS as unknown as LlmConfig["providers"],
    hasKey: false,
  });
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotStatus | null>(null);
  const [autopilotCycles, setAutopilotCycles] = useState<AutopilotCycle[]>([]);

  const showAuthGate = useCallback((setup = false) => {
    clearWorkspaceBoot();
    bootUserRef.current = null;
    setWorkspaceReady(false);
    setAuthenticated(false);
    setSetupRequired(setup);
    setUsername("");
  }, []);

  const toast = useCallback((message: string, isError = false) => {
    setToastMsg(message);
    setToastError(isError);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), isError ? 14000 : 4000);
  }, []);

  const callApi = useCallback(
    <T,>(path: string, options?: RequestInit) =>
      api<T>(path, options, () => showAuthGate(false)),
    [showAuthGate],
  );

  const toastRunResult = useCallback(
    (next: RunRecord, okPrefix: string) => {
      if (next?.status === "FAILED" || next?.status === "PUBLISH_FAILED") {
        toast(next.error || "Run failed", true);
      } else {
        toast(`${okPrefix} → ${next.status}`);
      }
    },
    [toast],
  );

  const pushProgress = useCallback((text: string) => {
    setProgress((prev) => {
      const last = prev.lines[prev.lines.length - 1];
      if (last?.text === text) return prev;
      return {
        ...prev,
        lines: [...prev.lines, { at: new Date().toLocaleTimeString(), text }].slice(-12),
      };
    });
  }, []);

  const startProgress = useCallback(
    (action: string) => {
      setProgress({ active: true, action, lines: [] });
      pushProgress(
        {
          run: "Starting full pipeline (research → outline → draft → quality)...",
          research: "Starting research...",
          outline: "Starting outline...",
          generate: "Starting article draft...",
          "quality-check": "Starting quality checks...",
          publish: "Starting publish...",
          "generate-images": "Starting image generation...",
        }[action] || "Processing request...",
      );
    },
    [pushProgress],
  );

  const stopProgress = useCallback(
    (success: boolean, message?: string) => {
      pushProgress(message || (success ? "Completed." : "Failed."));
      setProgress((prev) => ({ ...prev, active: false }));
    },
    [pushProgress],
  );

  const loadRuns = useCallback(async () => {
    const [list, dash] = await Promise.all([
      callApi<RunRecord[]>("/api/runs"),
      callApi<DashboardData>("/api/dashboard").catch(() => null),
    ]);
    setRuns(list);
    setDashboard(dash);
    setSelectedId((current) => {
      if (current && !list.find((r) => r.id === current)) {
        setRun(null);
        return null;
      }
      return current;
    });
  }, [callApi]);

  const loadTemplates = useCallback(async () => {
    const list = await callApi<TemplateRecord[]>("/api/templates");
    setTemplates(list);
    try {
      const data = await callApi<{ presets?: StylePreset[]; memory?: { lastStylePresetId?: string } }>(
        "/api/style-presets",
      );
      setStylePresets(data.presets || []);
      setLastStylePresetId(data.memory?.lastStylePresetId || "");
    } catch {
      /* optional */
    }
  }, [callApi]);

  const loadDigest = useCallback(async () => {
    setDigest("loading");
    try {
      const data = await callApi<DigestData>("/api/digest", {
        method: "POST",
        body: JSON.stringify({ refresh: false }),
      });
      setDigest(data);
      return data;
    } catch (e) {
      setDigest(null);
      throw e;
    }
  }, [callApi]);

  const refreshDigestInBackground = useCallback(async () => {
    if (digestRefreshing) return;
    const seq = ++digestRefreshSeq.current;
    setDigestRefreshing(true);
    toast("Refreshing hot topics in the background…");
    try {
      const data = await callApi<DigestData>("/api/digest", {
        method: "POST",
        body: JSON.stringify({ refresh: true }),
      });
      if (seq !== digestRefreshSeq.current) return;
      setDigest(data);
      const rotated = (data.notes || []).find((n) => /rotated|cycled/i.test(n));
      toast(
        rotated ||
          `Digest: ${data.github?.length ?? 0} GitHub · ${data.reddit?.length ?? 0} Reddit · ${data.x?.length ?? 0} X`,
      );
    } catch (e) {
      if (seq !== digestRefreshSeq.current) return;
      toast(e instanceof Error ? e.message : "Digest failed", true);
    } finally {
      if (seq === digestRefreshSeq.current) setDigestRefreshing(false);
    }
  }, [callApi, digestRefreshing, toast]);

  const loadHealth = useCallback(async () => {
    try {
      const h = await callApi<HealthData>("/api/health");
      setHealth(h);
      setHealthError(undefined);
      setHasGeminiKey(Boolean(h.hasGeminiKey));
    } catch (e) {
      setHealth(null);
      setHealthError(e instanceof Error ? e.message : "Health failed");
    }
  }, [callApi]);

  const loadLlm = useCallback(async () => {
    try {
      const data = await callApi<LlmConfig>("/api/llm");
      setLlm({
        ...data,
        providers: data.providers?.length
          ? data.providers
          : (LLM_PROVIDERS as unknown as LlmConfig["providers"]),
      });
    } catch {
      setLlm({
        provider: "groq",
        model: "openai/gpt-oss-20b",
        hasKey: false,
        providers: LLM_PROVIDERS as unknown as LlmConfig["providers"],
      });
    }
  }, [callApi]);

  const loadLogs = useCallback(async () => {
    try {
      const data = await callApi<{ entries?: LogEntry[] }>("/api/logs?limit=80");
      setLogs(data.entries || []);
    } catch (e) {
      setLogs([{ action: "error", at: new Date().toISOString(), username: e instanceof Error ? e.message : "error" }]);
    }
  }, [callApi]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await callApi<{ users?: UserRecord[] }>("/api/users");
      setUsers(data.users || []);
    } catch {
      setUsers([]);
    }
  }, [callApi]);

  const loadAutopilotStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/autopilot/status");
      if (!res.ok) return;
      setAutopilot(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const loadAutopilotHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/autopilot/history?limit=10");
      if (!res.ok) return;
      const data = await res.json();
      setAutopilotCycles(data.cycles || []);
    } catch {
      /* ignore */
    }
  }, []);

  const applyProgressFromRun = useCallback(
    (latest: RunRecord) => {
      const running = (latest.stages || []).find((s: { status?: string }) => s.status === "running");
      if (running) {
        pushProgress(
          (
            {
              research: "Gathering resources...",
              analysis: "Analyzing sources...",
              outline: "Drafting the outline...",
              generation: "Writing the article...",
              images: "Generating images with Gemini...",
              quality: "Scoring quality...",
              publish: "Publishing...",
            } as Record<string, string>
          )[String((running as { stage?: string }).stage)] ||
            `${(running as { stage?: string }).stage || "pipeline"}...`,
        );
      } else if (latest.error) {
        pushProgress(latest.error);
      }
    },
    [pushProgress],
  );

  const watchBackgroundRun = useCallback(
    async (runId: string, action: string) => {
      startProgress(action);
      setBusy(true);
      const startedAt = Date.now();
      const maxMs = 6 * 60 * 1000;
      let lastKey = "";
      try {
        while (Date.now() - startedAt < maxMs) {
          await new Promise((r) => setTimeout(r, 1800));
          const latest = await callApi<RunRecord>(`/api/runs/${encodeURIComponent(runId)}`);
          setRun(latest);
          setSelectedId((current) => current || runId);
          const running = (latest.stages || []).find((s: { status?: string }) => s.status === "running");
          const key = running
            ? `run:${(running as { stage?: string }).stage}`
            : `status:${latest.status}:${latest.error || ""}`;
          if (key !== lastKey) {
            lastKey = key;
            applyProgressFromRun(latest);
          }
          if (!isInFlightRun(latest) && Date.now() - startedAt > 1500) {
            stopProgress(
              !["FAILED", "PUBLISH_FAILED", "CANCELLED"].includes(latest.status),
              latest.error
                ? `${action} failed: ${latest.error}`
                : `${action} completed → ${latest.status}`,
            );
            toastRunResult(latest, `${action} complete`);
            if (
              latest?.article &&
              ["generate", "quality-check", "accept-stream-draft", "run", "save-review"].includes(
                action,
              )
            ) {
              if (["generate", "quality-check", "accept-stream-draft", "run"].includes(action)) {
                setTab("article");
              }
            }
            if (action === "approve") setTab("publish");
            if (action === "regenerate-section") setTab("article");
            await loadRuns();
            return latest;
          }
        }
        stopProgress(false, "Still running on the server — reopen this run to follow progress.");
        toast("Pipeline is still running in the background. Reopen the run to follow progress.", true);
        await loadRuns();
        return null;
      } catch (e) {
        stopProgress(false, e instanceof Error ? e.message : "Action failed.");
        toast(e instanceof Error ? e.message : "Action failed", true);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [
      startProgress,
      stopProgress,
      applyProgressFromRun,
      callApi,
      toastRunResult,
      toast,
      loadRuns,
    ],
  );

  const selectRun = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setHomeView("runs");
      const next = await callApi<RunRecord>(`/api/runs/${encodeURIComponent(id)}`);
      setRun(next);
      if (isInFlightRun(next)) {
        void watchBackgroundRun(id, "run");
      }
    },
    [callApi, watchBackgroundRun],
  );

  const act = useCallback(
    async (action: string, body?: Record<string, unknown>) => {
      if (!selectedId || busy) return null;
      const payload = { ...(body || {}), generateImages: Boolean(generateImages) };
      const backgroundActions = new Set([
        "run",
        "research",
        "outline",
        "generate",
        "quality-check",
        "publish",
        "generate-images",
        "readability-pass",
        "regenerate-section",
        "regenerate-selection",
        "accept-stream-draft",
        "refresh",
        "distribute",
      ]);
      try {
        const next = await callApi<RunRecord & { accepted?: boolean }>(
          `/api/runs/${encodeURIComponent(selectedId)}/${action}`,
          { method: "POST", body: JSON.stringify(payload) },
        );
        setRun(next);
        if (next.accepted || backgroundActions.has(action) || isInFlightRun(next)) {
          return watchBackgroundRun(selectedId, action);
        }
        startProgress(action);
        stopProgress(
          !["FAILED", "PUBLISH_FAILED"].includes(next.status),
          next.error ? `${action} failed: ${next.error}` : `${action} completed → ${next.status}`,
        );
        toastRunResult(next, `${action} complete`);
        if (action === "approve") setTab("publish");
        if (action === "regenerate-section") setTab("article");
        await loadRuns();
        return next;
      } catch (e) {
        stopProgress(false, e instanceof Error ? e.message : "Action failed.");
        toast(e instanceof Error ? e.message : "Action failed", true);
        try {
          if (selectedId) {
            const latest = await callApi<RunRecord>(`/api/runs/${encodeURIComponent(selectedId)}`);
            setRun(latest);
          }
        } catch {
          /* keep */
        }
        return null;
      }
    },
    [
      selectedId,
      busy,
      generateImages,
      hasGeminiKey,
      callApi,
      watchBackgroundRun,
      startProgress,
      stopProgress,
      toastRunResult,
      toast,
      loadRuns,
    ],
  );

  const refreshPageData = useCallback(async () => {
    try {
      await Promise.all([loadHealth(), loadLlm(), loadTemplates()]);
    } catch {
      /* individual loaders toast/handle */
    }
    if (page === "settings") {
      void Promise.all([
        loadLogs(),
        loadUsers(),
        loadAutopilotStatus(),
        loadAutopilotHistory(),
      ]).catch(() => {});
      return;
    }
    setDigest((prev) => (prev === null ? "loading" : prev));
    void loadRuns().catch((e) =>
      toast(e instanceof Error ? e.message : "Could not load runs", true),
    );
    void loadDigest().catch(() => {
      setDigest((prev) => (prev === "loading" ? null : prev));
    });
  }, [
    page,
    loadHealth,
    loadLlm,
    loadTemplates,
    loadLogs,
    loadUsers,
    loadAutopilotStatus,
    loadAutopilotHistory,
    loadRuns,
    loadDigest,
    toast,
  ]);

  const bootAfterAuth = useCallback(
    async (name: string) => {
      setAuthenticated(true);
      setUsername(name);
      setSetupRequired(false);
      // Only show the full-page loader on the first boot in this tab session.
      const showLoader = !workspaceReady;
      if (showLoader) setBooting(true);
      try {
        try {
          setGenerateImages(localStorage.getItem("pipeline.generateImages") === "1");
        } catch {
          /* ignore */
        }
        await refreshPageData();
        persistWorkspaceBoot(name);
        setWorkspaceReady(true);
      } finally {
        if (showLoader) setBooting(false);
      }
    },
    [workspaceReady, refreshPageData],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (sessionStatus === "loading") return;

        if (sessionStatus === "authenticated") {
          const name = session?.user?.username || session?.user?.name || "";
          if (!name) return;
          // Same tab session: keep UI mounted, but still hydrate data for this page.
          if (bootUserRef.current === name) {
            if (!cancelled) {
              setAuthenticated(true);
              setUsername(name);
              setSetupRequired(false);
              void refreshPageData();
            }
            return;
          }
          if (bootInFlightRef.current) return;
          bootInFlightRef.current = true;
          bootUserRef.current = name;
          try {
            if (!cancelled) await bootAfterAuth(name);
          } finally {
            bootInFlightRef.current = false;
          }
          return;
        }

        bootUserRef.current = null;
        const me = await fetch("/api/me", { credentials: "same-origin" })
          .then((r) => r.json())
          .catch(() => ({}));
        if (cancelled) return;
        if (me.authenticated && me.username) {
          if (bootUserRef.current === me.username) {
            void refreshPageData();
            return;
          }
          bootUserRef.current = me.username;
          await bootAfterAuth(me.username);
        } else {
          showAuthGate(Boolean(me.setupRequired));
        }
      } finally {
        if (!cancelled && sessionStatus !== "loading") setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    bootAfterAuth,
    refreshPageData,
    showAuthGate,
    session?.user?.username,
    session?.user?.name,
    sessionStatus,
  ]);

  useEffect(() => {
    document.title = page === "settings" ? "Settings · Spanwrap Pipeline" : "Spanwrap Blog Pipeline";
  }, [page]);

  // When navigating home ↔ settings inside the persistent shell, load that page's data.
  useEffect(() => {
    if (!authenticated) return;
    void refreshPageData();
  }, [page, authenticated, refreshPageData]);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("pipeline.sidebarCollapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pipeline.sidebarCollapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  async function createRun(brief: Record<string, string | string[] | null>, andRun: boolean) {
    if (busy) return;
    const sourceUrl =
      typeof brief.sourceUrl === "string"
        ? brief.sourceUrl
        : Array.isArray(brief.referenceUrls)
          ? String(brief.referenceUrls[0] || "")
          : "";
    const normalized = normalizeBriefUrls({
      topic: typeof brief.topic === "string" ? brief.topic : "",
      sourceUrl,
      referenceUrls: Array.isArray(brief.referenceUrls)
        ? brief.referenceUrls.map(String)
        : sourceUrl
          ? [sourceUrl]
          : [],
    });
    if (normalized.topic.length < 3 && !normalized.referenceUrls.length) {
      toast("Topic or source blog URL is required", true);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...brief,
        topic: normalized.topic,
        referenceUrls: normalized.referenceUrls,
        sourceUrl: undefined,
      };
      const created = await callApi<RunRecord>("/api/runs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast(
        normalized.referenceUrls.length
          ? `Created ${created.id} (source URL will be fetched during research)`
          : `Created ${created.id}`,
      );
      await loadRuns();
      setSelectedId(created.id);
      setRun(created);
      setHomeView("runs");
      setBusy(false);
      if (andRun) await act("run");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Create failed", true);
      setBusy(false);
    }
  }

  async function writeBlogFromRun() {
    if (!selectedId) {
      toast("Select a run in the list first", true);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      let current = run;
      if (!current || current.id !== selectedId) {
        current = await callApi<RunRecord>(`/api/runs/${encodeURIComponent(selectedId)}`);
        setRun(current);
      }
      const templateId = current.templateId || null;
      const locked = ["PUBLISHED", "APPROVED"].includes(current.status);
      let targetId = current.id;
      if (locked) {
        const created = await callApi<RunRecord>("/api/runs", {
          method: "POST",
          body: JSON.stringify({
            topic: current.brief.topic,
            targetAudience: current.brief.targetAudience,
            tone: current.brief.tone,
            keywords: current.brief.keywords || [],
            referenceUrls: current.brief.referenceUrls || [],
            templateId,
          }),
        });
        targetId = created.id;
        setSelectedId(created.id);
        setRun(created);
      }
      setBusy(false);
      setHomeView("runs");
      const next = await callApi<RunRecord & { accepted?: boolean }>(
        `/api/runs/${encodeURIComponent(targetId)}/run`,
        { method: "POST", body: "{}" },
      );
      setRun(next);
      setSelectedId(targetId);
      if (next.accepted || isInFlightRun(next)) {
        await watchBackgroundRun(targetId, "run");
      } else {
        toastRunResult(next, locked ? `Wrote new draft ${next.id}` : "Write blog finished");
        if (next?.article) setTab("article");
        await loadRuns();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Write failed", true);
      await loadRuns().catch(() => {});
      setBusy(false);
    }
  }

  if (booting && !workspaceReady) {
    return <LoadingScreen label="Preparing your workspace…" />;
  }

  // Never tear down the app on tab-focus / session refetch once this tab has booted.
  if (!authenticated && !workspaceReady) {
    if (sessionStatus === "loading" || !authChecked) {
      return <LoadingScreen label="Loading Spanwrap Pipeline…" />;
    }
    return (
      <>
        <AuthGate
          setupRequired={setupRequired}
          onAuthenticated={(name) => {
            bootUserRef.current = name;
            void bootAfterAuth(name).catch((e) => toast(e.message, true));
          }}
        />
        <Toast message={toastMsg} isError={toastError} />
      </>
    );
  }

  return (
    <>
      <div className="app">
        <header className="top">
          <div>
            <p className="brand">Spanwrap Pipeline</p>
            <h1>{page === "settings" ? "Settings" : "Blog content runs"}</h1>
          </div>
          <div className="top-right">
            {username ? <span className="auth-user">{username}</span> : null}
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                bootUserRef.current = null;
                clearWorkspaceBoot();
                setWorkspaceReady(false);
                await signOut({ redirect: false });
                showAuthGate(false);
              }}
            >
              Log out
            </button>
            {page === "settings" ? (
              <Link href="/" className="btn ghost">
                Back to runs
              </Link>
            ) : (
              <Link href="/settings" className="icon-btn" aria-label="Settings" title="Settings">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
            )}
          </div>
        </header>

        {page === "home" ? (
          <div
            className={`home-shell${sidebarCollapsed ? " is-collapsed" : ""}`}
            data-view={homeView}
          >
            <aside className="home-sidebar" aria-label="Workspace sidebar">
              <div className="home-sidebar-top">
                <button
                  type="button"
                  className="sidebar-toggle"
                  onClick={toggleSidebar}
                  aria-expanded={!sidebarCollapsed}
                  aria-controls="home-sidebar-nav"
                  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  <SidebarToggleIcon collapsed={sidebarCollapsed} />
                  <span className="sidebar-toggle-label">Menu</span>
                </button>
              </div>
              <nav id="home-sidebar-nav" className="home-nav" aria-label="Workspace">
                {(
                  [
                    {
                      id: "topics" as const,
                      label: "Hot topics",
                      icon: (
                        <>
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </>
                      ),
                    },
                    {
                      id: "create" as const,
                      label: "New run",
                      icon: (
                        <>
                          <path d="M12 5v14" />
                          <path d="M5 12h14" />
                        </>
                      ),
                    },
                    {
                      id: "runs" as const,
                      label: "Runs",
                      icon: (
                        <>
                          <path d="M4 6h16" />
                          <path d="M4 12h16" />
                          <path d="M4 18h10" />
                        </>
                      ),
                    },
                  ] as const
                ).map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`home-nav-btn ${homeView === id ? "active" : ""}`}
                    onClick={() => setHomeView(id)}
                    title={label}
                    aria-current={homeView === id ? "page" : undefined}
                  >
                    <svg
                      className="home-nav-icon"
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {icon}
                    </svg>
                    <span className="home-nav-label">{label}</span>
                  </button>
                ))}
              </nav>
            </aside>
            <main className="home-main">
              {homeView === "topics" ? (
                <TopicsView
                  digest={digest}
                  digestFilter={digestFilter}
                  busy={busy}
                  refreshing={digestRefreshing}
                  onFilter={setDigestFilter}
                  onRefresh={() => {
                    void refreshDigestInBackground();
                  }}
                  onWrite={async (item: DigestItem) => {
                    setBusy(true);
                    try {
                      const result = await callApi<{ run: RunRecord }>("/api/digest/start-run", {
                        method: "POST",
                        body: JSON.stringify({
                          title: item.title || "",
                          url: item.url || "",
                          description: item.description || "",
                          templateId: null,
                        }),
                      });
                      toast(`Created run ${result.run.id}`);
                      await loadRuns();
                      setSelectedId(result.run.id);
                      setRun(result.run);
                      setHomeView("runs");
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Failed", true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              ) : null}
              {homeView === "create" ? (
                <CreateRunView
                  templates={templates}
                  stylePresets={stylePresets}
                  lastStylePresetId={lastStylePresetId}
                  busy={busy}
                  onCreate={createRun}
                  onBatch={async (topics, templateId, stylePresetId) => {
                    if (!topics.length) {
                      toast("Add at least one topic (one per line)", true);
                      return;
                    }
                    setBusy(true);
                    try {
                      const data = await callApi<{ runs?: RunRecord[] }>("/api/runs/batch", {
                        method: "POST",
                        body: JSON.stringify({
                          topics,
                          templateId,
                          stylePresetId,
                          generateImages: Boolean(generateImages),
                        }),
                      });
                      toast(`Batch created ${data.runs?.length || 0} runs through outline`);
                      await loadRuns();
                      if (data.runs?.[0]?.id) await selectRun(data.runs[0].id);
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Batch failed", true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              ) : null}
              {homeView === "runs" ? (
                <RunsView
                  runs={runs}
                  dashboard={dashboard}
                  selectedId={selectedId}
                  run={run}
                  templates={templates}
                  tab={tab}
                  busy={busy}
                  hasGeminiKey={hasGeminiKey}
                  generateImages={generateImages}
                  progress={progress}
                  onRefresh={() => loadRuns().catch((e) => toast(e.message, true))}
                  onWriteBlog={writeBlogFromRun}
                  onSelect={(id) => {
                    if (!id) {
                      setSelectedId(null);
                      setRun(null);
                      return;
                    }
                    selectRun(id).catch((e) => toast(e.message, true));
                  }}
                  onDelete={async (id) => {
                    try {
                      await callApi(`/api/runs/${encodeURIComponent(id)}`, { method: "DELETE" });
                      toast("Run deleted successfully");
                      if (selectedId === id) {
                        setSelectedId(null);
                        setRun(null);
                      }
                      await loadRuns();
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Delete failed", true);
                    }
                  }}
                  onTab={setTab}
                  onAct={act}
                  onGenerateImagesChange={(value) => {
                    setGenerateImages(value);
                    try {
                      localStorage.setItem("pipeline.generateImages", value ? "1" : "0");
                    } catch {
                      /* ignore */
                    }
                  }}
                  onRunUpdated={setRun}
                  toast={toast}
                />
              ) : null}
            </main>
          </div>
        ) : (
          <SettingsView
            health={health}
            healthError={healthError}
            llm={llm}
            templates={templates}
            users={users}
            logs={logs}
            autopilot={autopilot}
            autopilotCycles={autopilotCycles}
            busy={busy}
            onSaveLlm={async (provider, model, apiKey) => {
              setBusy(true);
              try {
                const saved = await callApi<LlmConfig>("/api/llm", {
                  method: "POST",
                  body: JSON.stringify({ provider, model, apiKey }),
                });
                setLlm({
                  ...saved,
                  providers: saved.providers?.length
                    ? saved.providers
                    : (LLM_PROVIDERS as unknown as LlmConfig["providers"]),
                });
                toast(`LLM set to ${saved.provider} · ${saved.model}`);
                await loadHealth();
              } catch (e) {
                toast(e instanceof Error ? e.message : "Save failed", true);
              } finally {
                setBusy(false);
              }
            }}
            onLlmProviderChange={(provider) => {
              const providers = llm.providers?.length
                ? llm.providers
                : (LLM_PROVIDERS as unknown as NonNullable<LlmConfig["providers"]>);
              const info = providers.find((p) => p.id === provider);
              setLlm((prev) => ({
                ...prev,
                providers,
                provider,
                model: info?.defaultModel || "",
                hasKey: prev.provider === provider ? prev.hasKey : false,
                keyPreview: prev.provider === provider ? prev.keyPreview : null,
                remappedFrom: null,
              }));
            }}
            onSaveTemplate={async (name, markdown, filename) => {
              try {
                if (!markdown) throw new Error("Provide a .md file or paste markdown");
                const tokens = Math.ceil(markdown.length / 4);
                await callApi("/api/templates", {
                  method: "POST",
                  body: JSON.stringify({ name, markdown, filename }),
                });
                if (tokens > 1500) {
                  toast(
                    `Template saved (~${tokens.toLocaleString()} tokens). That is large for Groq's free TPM cap — keep headings and short instructions so generation does not 413.`,
                  );
                } else {
                  toast("Template saved");
                }
                await loadTemplates();
              } catch (e) {
                toast(e instanceof Error ? e.message : "Template save failed", true);
              }
            }}
            onUpdateTemplate={async ({ id, name, markdown, filename }) => {
              if (!markdown.trim()) throw new Error("Template markdown cannot be empty");
              const tokens = Math.ceil(markdown.length / 4);
              await callApi("/api/templates", {
                method: "POST",
                body: JSON.stringify({ id, name, markdown, filename }),
              });
              if (tokens > 1500) {
                toast(
                  `Template updated (~${tokens.toLocaleString()} tokens). That is large for Groq's free TPM cap — keep headings and short instructions so generation does not 413.`,
                );
              } else {
                toast("Template updated");
              }
              await loadTemplates();
            }}
            onDeleteTemplate={async (id) => {
              try {
                await callApi(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
                toast("Template deleted");
                await loadTemplates();
              } catch (e) {
                toast(e instanceof Error ? e.message : "Delete failed", true);
              }
            }}
            onFetchTemplate={async (id) => {
              const data = await callApi<{
                id: string;
                name: string;
                markdown: string;
                filename?: string | null;
              }>(`/api/templates/${encodeURIComponent(id)}`);
              return data;
            }}
            onAddUser={async (u, password) => {
              try {
                await callApi("/api/users", {
                  method: "POST",
                  body: JSON.stringify({ username: u, password }),
                });
                toast("Person added");
                await loadUsers();
                await loadLogs();
              } catch (e) {
                toast(e instanceof Error ? e.message : "Add user failed", true);
              }
            }}
            onRefreshLogs={() => loadLogs().catch((e) => toast(e.message, true))}
            onToggleAutopilot={async () => {
              try {
                const res = await fetch("/api/autopilot/toggle", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ enabled: !autopilot?.enabled }),
                });
                if (!res.ok) throw new Error("Toggle failed");
                const data = await res.json();
                setAutopilot(data);
                toast(data.enabled ? "Autopilot enabled" : "Autopilot disabled");
              } catch (e) {
                toast(e instanceof Error ? e.message : "Toggle failed", true);
              }
            }}
            onTriggerAutopilot={async () => {
              try {
                const res = await fetch("/api/autopilot/trigger", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({}),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Trigger failed");
                toast(
                  `Autopilot cycle complete: ${data.runsCreated?.length ?? 0} runs created, ${data.runsPublished ?? 0} published`,
                );
                await loadAutopilotStatus();
                await loadAutopilotHistory();
              } catch (e) {
                toast(e instanceof Error ? e.message : "Trigger failed", true);
              }
            }}
          />
        )}
      </div>
      <Toast message={toastMsg} isError={toastError} />
    </>
  );
}
