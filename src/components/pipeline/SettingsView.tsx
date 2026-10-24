"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { LLM_PROVIDERS } from "./constants";
import { markdownToEditorHtml } from "./markdown";
import {
  AutopilotCycle,
  AutopilotStatus,
  EmailNotifyConfig,
  ReaderProfile,
  ReaderProfilesConfig,
  HealthData,
  LlmConfig,
  LlmProvider,
  LogEntry,
  TemplateRecord,
  UserRecord,
} from "./types";
import { activityLabel, formatWhen } from "./utils";
import { SidebarToggleIcon } from "./SidebarToggleIcon";

type SettingsSection = "status" | "llm" | "templates" | "autopilot" | "email" | "people" | "activity";

const SETTINGS_NAV: { id: SettingsSection; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "llm", label: "LLM" },
  { id: "templates", label: "Templates" },
  { id: "autopilot", label: "Autopilot" },
  { id: "email", label: "Email" },
  { id: "people", label: "People" },
  { id: "activity", label: "Activity" },
];

type SettingsViewProps = {
  health: HealthData | null;
  healthError?: string;
  llm: LlmConfig;
  templates: TemplateRecord[];
  users: UserRecord[];
  logs: LogEntry[];
  autopilot: AutopilotStatus | null;
  autopilotCycles: AutopilotCycle[];
  emailNotify: EmailNotifyConfig | null;
  readerProfiles: ReaderProfilesConfig | null;
  busy: boolean;
  onSaveLlm: (provider: string, model: string, apiKey?: string) => void;
  onSaveTemplate: (name: string, markdown: string, filename: string) => void;
  onUpdateTemplate: (input: {
    id: string;
    name: string;
    markdown: string;
    filename?: string;
  }) => Promise<void>;
  onDeleteTemplate: (id: string) => void;
  onFetchTemplate: (id: string) => Promise<{
    id: string;
    name: string;
    markdown: string;
    filename?: string | null;
  }>;
  onAddUser: (username: string, password: string) => void;
  onRefreshLogs: () => void;
  onToggleAutopilot: () => void;
  onTriggerAutopilot: () => void;
  onLlmProviderChange: (provider: string) => void;
  onSaveReaderProfiles: (input: {
    profiles: ReaderProfile[];
    defaultProfileId: string;
  }) => Promise<void>;
  onSaveEmailNotify: (input: { enabled: boolean; recipients: string[] }) => Promise<void>;
  onTestEmailNotify: () => Promise<void>;
  onRetryCycleEmail: (cycleId: string) => Promise<void>;
};

function NavIcon({ id }: { id: SettingsSection }) {
  const common = {
    className: "home-nav-icon",
    xmlns: "http://www.w3.org/2000/svg",
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (id) {
    case "status":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l2.5 2.5" />
        </svg>
      );
    case "llm":
      return (
        <svg {...common}>
          <path d="M12 3v3" />
          <path d="M12 18v3" />
          <path d="M3 12h3" />
          <path d="M18 12h3" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case "templates":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      );
    case "autopilot":
      return (
        <svg {...common}>
          <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
        </svg>
      );
    case "email":
      return (
        <svg {...common}>
          <path d="M4 4h16v16H4z" />
          <path d="M4 7l8 6 8-6" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15v-4" />
          <path d="M12 15V8" />
          <path d="M16 15v-6" />
        </svg>
      );
  }
}

function cycleNeedsEmailRetry(cycle: AutopilotCycle): boolean {
  const email = cycle.email as { status?: string } | undefined;
  if (email?.status === "sent" || email?.status === "skipped") return false;
  if (email?.status === "failed" || email?.status === "pending") return true;
  return Boolean(cycle.runsCreated?.some((run: { runId?: string }) => run.runId));
}

function CycleEmailStatus({
  cycle,
  retrying,
  onRetry,
}: {
  cycle: AutopilotCycle;
  retrying: boolean;
  onRetry: () => void;
}) {
  const email = cycle.email as
    | { status?: string; error?: string; queued?: boolean }
    | undefined;
  const status = email?.status;
  const label =
    status === "sent"
      ? "email sent"
      : status === "failed"
        ? "email failed"
        : status === "skipped"
          ? "email skipped"
          : status === "pending"
            ? "email queued"
            : cycle.runsCreated?.some((run: { runId?: string }) => run.runId)
              ? "email not sent"
              : null;
  if (!label) return null;
  const badgeClass =
    status === "sent" ? "completed" : status === "skipped" ? "disabled" : status === "pending" ? "running" : "failed";
  return (
    <>
      <span className={`ap-badge ${badgeClass}`} title={email?.error || undefined}>
        {label}
      </span>
      {status === "failed" && email?.error ? (
        <span className="ap-email-error" title={email.error}>
          {email.error}
        </span>
      ) : null}
      {email?.queued ? <span className="ap-badge running">queued for retry</span> : null}
      {cycleNeedsEmailRetry(cycle) ? (
        <button type="button" className="btn ap-retry" disabled={retrying} onClick={onRetry}>
          {retrying ? "Sending…" : "Retry email"}
        </button>
      ) : null}
    </>
  );
}

export function SettingsView({
  health,
  healthError,
  llm,
  templates,
  users,
  logs,
  autopilot,
  autopilotCycles,
  emailNotify,
  readerProfiles,
  busy,
  onSaveLlm,
  onSaveTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onFetchTemplate,
  onAddUser,
  onRefreshLogs,
  onToggleAutopilot,
  onTriggerAutopilot,
  onLlmProviderChange,
  onSaveReaderProfiles,
  onSaveEmailNotify,
  onTestEmailNotify,
  onRetryCycleEmail,
}: SettingsViewProps) {
  const providers: LlmProvider[] = llm.providers?.length
    ? llm.providers
    : (LLM_PROVIDERS as unknown as LlmProvider[]);
  const providerId = llm.provider || "groq";
  const current = providers.find((p) => p.id === providerId) || providers[0];
  const modelId = llm.model || current?.defaultModel || "";
  const known = (current?.models || []).some((m) => m.id === modelId);
  const [customModel, setCustomModel] = useState(!known ? modelId : "");
  const [modelSelect, setModelSelect] = useState(known ? modelId : "__custom__");
  const [apiKey, setApiKey] = useState("");
  const [templateMarkdown, setTemplateMarkdown] = useState("");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [section, setSection] = useState<SettingsSection>("status");
  const [retryingCycleId, setRetryingCycleId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [preview, setPreview] = useState<{
    id: string;
    name: string;
    markdown: string;
    filename?: string | null;
  } | null>(null);
  const [previewDraft, setPreviewDraft] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [previewMode, setPreviewMode] = useState<"rendered" | "source">("rendered");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSaving, setPreviewSaving] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewSaveError, setPreviewSaveError] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [readerDraft, setReaderDraft] = useState<ReaderProfile[]>([]);
  const [defaultReaderId, setDefaultReaderId] = useState("");

  useEffect(() => {
    setReaderDraft(readerProfiles?.profiles?.map((profile) => ({ ...profile })) || []);
    setDefaultReaderId(readerProfiles?.defaultProfileId || "");
  }, [readerProfiles]);

  useEffect(() => {
    setEmailEnabled(emailNotify?.enabled !== false);
    setEmailRecipients((emailNotify?.recipients || []).join("\n"));
  }, [emailNotify?.enabled, emailNotify?.recipients, emailNotify?.updatedAt]);

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

  const closePreview = useCallback(() => {
    setPreview(null);
    setPreviewDraft("");
    setPreviewName("");
    setPreviewError("");
    setPreviewSaveError("");
    setPreviewLoading(false);
    setPreviewSaving(false);
    setPreviewMode("rendered");
  }, []);

  const openPreview = useCallback(
    async (id: string) => {
      setPreviewLoading(true);
      setPreviewError("");
      setPreviewSaveError("");
      setPreviewMode("source");
      setPreview({ id, name: "Loading…", markdown: "" });
      setPreviewDraft("");
      setPreviewName("");
      try {
        const data = await onFetchTemplate(id);
        setPreview({
          id: data.id,
          name: data.name,
          markdown: data.markdown || "",
          filename: data.filename,
        });
        setPreviewDraft(data.markdown || "");
        setPreviewName(data.name || "");
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : "Failed to load template");
      } finally {
        setPreviewLoading(false);
      }
    },
    [onFetchTemplate],
  );

  const previewDirty = Boolean(
    preview &&
      (previewDraft !== preview.markdown || previewName.trim() !== preview.name.trim()),
  );

  const savePreview = useCallback(async () => {
    if (!preview || previewSaving) return;
    setPreviewSaving(true);
    setPreviewSaveError("");
    try {
      await onUpdateTemplate({
        id: preview.id,
        name: previewName.trim() || preview.name,
        markdown: previewDraft,
        filename: preview.filename || undefined,
      });
      const nextName = previewName.trim() || preview.name;
      setPreview({
        ...preview,
        name: nextName,
        markdown: previewDraft,
      });
      setPreviewName(nextName);
    } catch (e) {
      setPreviewSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPreviewSaving(false);
    }
  }, [onUpdateTemplate, preview, previewDraft, previewName, previewSaving]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewDirty && !confirm("Discard unsaved changes?")) return;
        closePreview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, previewDirty, closePreview]);

  const previewHtml = useMemo(
    () => markdownToEditorHtml(previewDraft || preview?.markdown || ""),
    [previewDraft, preview?.markdown],
  );

  const templateHint = useMemo(() => {
    const chars = templateMarkdown.length;
    const tokens = Math.ceil(chars / 4);
    return {
      text: `Rough size: ${chars.toLocaleString()} characters (~${tokens.toLocaleString()} tokens). Aim under ~1,500 tokens so topic + research still fit.`,
      warn: tokens > 1500,
    };
  }, [templateMarkdown]);

  const healthRows = health
    ? [
        ["storage", health.storage],
        [
          "llm",
          health.hasLlmKey
            ? `${health.llmProvider} · ${health.llmModel || ""}`.trim()
            : `${health.llmProvider} (no key → mock)`,
        ],
        ["research", health.researchProvider],
        ["publish key", health.hasSpanwrapKey ? "set" : "missing"],
        ["gemini images", health.hasGeminiKey ? "key set" : "no key (web search fallback)"],
        [
          "auto-accept",
          health.autoAcceptEnabled ? `on (≥${health.autoAcceptMinScore})` : "off",
        ],
        ["github", health.hasGithubToken ? "token" : "public"],
        ["reddit", health.hasRedditOAuth ? "oauth" : "public"],
        ["x", health.hasXBearer ? "api" : "off"],
      ]
    : healthError
      ? [["error", healthError]]
      : [["storage", "Loading…"]];

  function selectedModel() {
    if (modelSelect === "__custom__") return customModel.trim();
    return modelSelect.trim();
  }

  async function submitTemplate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    let markdown = String(fd.get("markdown") || "").trim();
    let filename = "";
    if (templateFile) {
      markdown = await templateFile.text();
      filename = templateFile.name;
    }
    onSaveTemplate(name, markdown, filename);
    e.currentTarget.reset();
    setTemplateMarkdown("");
    setTemplateFile(null);
  }

  const cfg = autopilot?.config || {};

  return (
    <div className={`home-shell${sidebarCollapsed ? " is-collapsed" : ""}`}>
      <aside className="home-sidebar" aria-label="Settings sidebar">
        <div className="home-sidebar-top">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-controls="settings-sidebar-nav"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <SidebarToggleIcon collapsed={sidebarCollapsed} />
            <span className="sidebar-toggle-label">Menu</span>
          </button>
        </div>
        <nav id="settings-sidebar-nav" className="home-nav" aria-label="Settings sections">
          {SETTINGS_NAV.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`home-nav-btn ${section === id ? "active" : ""}`}
              onClick={() => setSection(id)}
              title={label}
              aria-current={section === id ? "page" : undefined}
            >
              <NavIcon id={id} />
              <span className="home-nav-label">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="home-main">
        <div className="settings-main">
          {section === "status" ? (
            <section className="panel">
              <h2>Status</h2>
              <dl className="status-grid">
                {healthRows.map(([k, v]) => (
                  <div key={String(k)}>
                    <dt>{k}</dt>
                    <dd>{String(v ?? "")}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {section === "llm" ? (
            <section className="panel llm">
              <div className="panel-head">
                <h2>LLM</h2>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => onSaveLlm(providerId, selectedModel(), apiKey.trim() || undefined)}
                >
                  Save
                </button>
              </div>
              <p className="hint">
                Pick a provider and paste its API key. Groq is free-tier by default{" "}
                <code>openai/gpt-oss-20b</code> — Llama 3.3 70B was retired). Keys stay on this
                server, not in git. Free Groq models often cap at{" "}
                <strong>8,000 tokens per minute</strong> (input + reserved output). A long template
                plus research will 413 — keep templates short, or use a model with a higher TPM
                limit.
              </p>
              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  onSaveLlm(providerId, selectedModel(), apiKey.trim() || undefined);
                }}
              >
                <label>
                  Provider
                  <select
                    value={providerId}
                    onChange={(e) => {
                      onLlmProviderChange(e.target.value);
                      const info = providers.find((p) => p.id === e.target.value);
                      setModelSelect(info?.defaultModel || "");
                      setCustomModel("");
                    }}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Model
                  <select value={modelSelect} onChange={(e) => setModelSelect(e.target.value)}>
                    {(current?.models || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                    <option value="__custom__">Custom…</option>
                  </select>
                </label>
                {modelSelect === "__custom__" ? (
                  <label className="full">
                    Custom model id
                    <input
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="provider/model-id"
                    />
                  </label>
                ) : null}
                {providerId !== "mock" ? (
                  <label className="full">
                    API key
                    <input
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        llm.hasKey
                          ? `Saved ${llm.keyPreview || "••••"} — paste to replace`
                          : `Paste ${current?.keyLabel || "API key"}`
                      }
                    />
                  </label>
                ) : null}
              </form>
            </section>
          ) : null}

          {section === "templates" ? (
            <section className="panel templates">
              <div className="panel-head">
                <h2>Markdown templates</h2>
              </div>
              <p className="hint">
                Upload <code>.md</code> templates. Headings become required sections; other prose is
                writing instructions. The whole template is sent to the LLM with the topic and
                research sources, so keep it short — section headings and a few sentences of
                guidance, not a full sample article. Optional placeholders:{" "}
                <code>{"{{title}}"}</code>, <code>{"{{body}}"}</code>, <code>{"{{sources}}"}</code>,
                etc.
              </p>
              <form className="form-grid" onSubmit={submitTemplate}>
                <label>
                  Name
                  <input name="name" placeholder="Founder blog v1" required />
                </label>
                <label>
                  Markdown file
                  <input
                    name="file"
                    type="file"
                    accept=".md,text/markdown,text/plain"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      setTemplateFile(file);
                      if (file) setTemplateMarkdown(await file.text());
                    }}
                  />
                </label>
                <label className="full">
                  Or paste markdown
                  <textarea
                    name="markdown"
                    value={templateMarkdown}
                    onChange={(e) => setTemplateMarkdown(e.target.value)}
                    placeholder={
                      "# {{title}}\n\n## Hook\n…\n\n{{body}}\n\n## Sources\n{{sources}}"
                    }
                  />
                </label>
                <p className={`hint full ${templateHint.warn ? "hint-warn" : ""}`}>
                  {templateHint.text}
                </p>
                <div className="form-actions">
                  <button type="submit" className="btn primary" disabled={busy}>
                    Save template
                  </button>
                </div>
              </form>
              <ul className="template-list">
                {!templates.length ? (
                  <li className="empty">No templates uploaded yet.</li>
                ) : (
                  templates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="template-list-open"
                        onClick={() => void openPreview(t.id)}
                      >
                        <strong>{t.name}</strong>
                        <div className="meta">
                          {t.id} · {t.filename || "pasted"}
                          {t.chars ? ` · ~${Math.ceil(t.chars / 4)} tokens` : ""}
                          <span className="template-preview-hint"> · Preview</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          if (confirm("Delete this template?")) onDeleteTemplate(t.id);
                        }}
                      >
                        Delete
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ) : null}

          {section === "autopilot" ? (
            <section className="panel autopilot-panel">
              <div className="panel-head">
                <h2>Autopilot</h2>
                <div className="autopilot-controls">
                  <button type="button" className="btn primary" onClick={onTriggerAutopilot}>
                    Run Now
                  </button>
                  <button
                    type="button"
                    className={`btn ${autopilot?.enabled ? "ap-toggle-on" : ""}`}
                    onClick={onToggleAutopilot}
                  >
                    {autopilot?.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
              <p className="hint">
                Daily draft for Spanwrap. Discovers a technical topic for the selected reader,
                writes the article, and emails it. It does not publish. Set{" "}
                <code>AUTOPILOT_ENABLED=true</code> for the daily schedule, or click{" "}
                <strong>Run Now</strong> to draft immediately.
              </p>
              <div className="autopilot-status">
                <dl className="status-grid">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span className={`ap-badge ${autopilot?.enabled ? "enabled" : "disabled"}`}>
                        {autopilot?.enabled ? "Enabled" : "Disabled"}
                      </span>
                      {autopilot?.cycleBusy ? (
                        <>
                          {" "}
                          <span className="ap-badge running">Cycle running…</span>
                        </>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Next run</dt>
                    <dd>
                      {autopilot?.nextRun
                        ? new Date(autopilot.nextRun).toLocaleString()
                        : autopilot?.enabled
                          ? "Computing…"
                          : "Not scheduled"}
                    </dd>
                  </div>
                  <div>
                    <dt>Schedule</dt>
                    <dd>{autopilot?.cronExpression || "0 8 * * *"}</dd>
                  </div>
                  <div>
                    <dt>Drafts</dt>
                    <dd>1 Spanwrap article / day</dd>
                  </div>
                  <div>
                    <dt>Publishes</dt>
                    <dd>No — you publish from the run</dd>
                  </div>
                  <div>
                    <dt>Reader</dt>
                    <dd>{cfg.readerLabel || readerProfiles?.activeLabel || "—"}</dd>
                  </div>
                  <div>
                    <dt>Min quality</dt>
                    <dd>{String(cfg.minQualityScore ?? "—")}</dd>
                  </div>
                  <div>
                    <dt>Dedup window</dt>
                    <dd>{`${cfg.deduplicationDays ?? 30} days`}</dd>
                  </div>
                  <div>
                    <dt>Dry run</dt>
                    <dd>{cfg.dryRun ? "Yes (no publish)" : "No"}</dd>
                  </div>
                </dl>
              </div>
              <div className="reader-profiles" style={{ marginTop: "1.25rem" }}>
                <div className="panel-head">
                  <h3>Reader</h3>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || !readerDraft.length}
                    onClick={() =>
                      void onSaveReaderProfiles({
                        profiles: readerDraft,
                        defaultProfileId: defaultReaderId || readerDraft[0]?.id || "",
                      })
                    }
                  >
                    Save reader
                  </button>
                </div>
                <p className="hint">
                  The daily draft uses the selected reader. Tone stays technical; this only changes
                  who the article is for.
                </p>
                <label>
                  Default reader
                  <select
                    value={defaultReaderId}
                    onChange={(e) => setDefaultReaderId(e.target.value)}
                  >
                    {readerDraft.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </label>
                {readerDraft.map((profile, index) => (
                  <div key={profile.id} className="form-grid" style={{ marginTop: "0.75rem" }}>
                    <label>
                      Label
                      <input
                        value={profile.label}
                        onChange={(e) =>
                          setReaderDraft((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, label: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Who they are
                      <input
                        value={profile.audience}
                        onChange={(e) =>
                          setReaderDraft((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, audience: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Seniority
                      <input
                        value={profile.seniority}
                        onChange={(e) =>
                          setReaderDraft((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, seniority: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Stack
                      <input
                        value={profile.stack}
                        onChange={(e) =>
                          setReaderDraft((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, stack: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="full">
                      What they want
                      <input
                        value={profile.goal}
                        onChange={(e) =>
                          setReaderDraft((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, goal: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
              <div className="autopilot-history">
                <h3>Recent cycles</h3>
                <div className="ap-history-scroll">
                  <table className="ap-history-table">
                    <thead>
                      <tr>
                        <th>Cycle</th>
                        <th>Status</th>
                        <th>Topics</th>
                        <th>Runs</th>
                        <th>Published</th>
                        <th>Review</th>
                        <th>Errors</th>
                        <th>Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!autopilotCycles.length ? (
                        <tr>
                          <td colSpan={8} className="empty-row">
                            No cycles recorded yet.
                          </td>
                        </tr>
                      ) : (
                        autopilotCycles.map((c) => {
                          const statusClass =
                            c.status === "completed"
                              ? "completed"
                              : c.status === "failed"
                                ? "failed"
                                : "running";
                          return (
                            <tr key={c.id}>
                              <td title={c.id}>{String(c.id).slice(0, 12)}…</td>
                              <td className="ap-status-cell">
                                <span className={`ap-badge ${statusClass}`}>{c.status}</span>
                                <CycleEmailStatus
                                  cycle={c}
                                  retrying={retryingCycleId === c.id}
                                  onRetry={() => {
                                    setRetryingCycleId(c.id);
                                    void onRetryCycleEmail(c.id).finally(() =>
                                      setRetryingCycleId((current) =>
                                        current === c.id ? null : current,
                                      ),
                                    );
                                  }}
                                />
                              </td>
                              <td>{c.topicsSelected}</td>
                              <td>{c.runsCreated ? c.runsCreated.length : 0}</td>
                              <td>{c.runsPublished}</td>
                              <td>{c.runsNeedingReview}</td>
                              <td>{c.errors ? c.errors.length : 0}</td>
                              <td>{new Date(c.startedAt).toLocaleString()}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          {section === "email" ? (
            <section className="panel">
              <div className="panel-head">
                <h2>Email (Brevo)</h2>
                <div className="autopilot-controls">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !emailNotify?.configured}
                    title={
                      emailNotify?.configured
                        ? "Send a test message to the saved recipients"
                        : "Set BREVO_API_KEY and BREVO_SENDER_EMAIL in .env first"
                    }
                    onClick={() => void onTestEmailNotify()}
                  >
                    Send test
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() =>
                      void onSaveEmailNotify({
                        enabled: emailEnabled,
                        recipients: emailRecipients
                          .split(/[\n,;]+/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  >
                    Save
                  </button>
                </div>
              </div>
              <p className="hint">
                When Autopilot finishes a blog run, the pipeline can email the draft as a{" "}
                <code>.md</code> attachment via Brevo. Put API credentials in <code>.env</code>, then
                choose recipients here.
              </p>
              <dl className="status-grid" style={{ marginBottom: "1rem" }}>
                <div>
                  <dt>API key</dt>
                  <dd>{emailNotify?.hasApiKey ? "set" : "missing (BREVO_API_KEY)"}</dd>
                </div>
                <div>
                  <dt>Sender</dt>
                  <dd>{emailNotify?.senderEmail || "missing (BREVO_SENDER_EMAIL)"}</dd>
                </div>
                <div>
                  <dt>Ready</dt>
                  <dd>{emailNotify?.configured ? "yes" : "no"}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>
                    {emailNotify?.updatedAt && emailNotify.updatedAt !== new Date(0).toISOString()
                      ? new Date(emailNotify.updatedAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
              </dl>
              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  void onSaveEmailNotify({
                    enabled: emailEnabled,
                    recipients: emailRecipients
                      .split(/[\n,;]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  });
                }}
              >
                <label className="check full" style={{ flexDirection: "row", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                  />
                  <span>Send Autopilot draft emails</span>
                </label>
                <label className="full">
                  Recipients (one email per line)
                  <textarea
                    value={emailRecipients}
                    onChange={(e) => setEmailRecipients(e.target.value)}
                    placeholder={"editor@spanwrap.com\nteam@spanwrap.com"}
                    rows={5}
                  />
                </label>
                <p className="hint full">
                  Optional defaults also come from <code>BREVO_NOTIFY_TO</code> in <code>.env</code>{" "}
                  until you save recipients here.
                </p>
              </form>
            </section>
          ) : null}

          {section === "people" ? (
            <section className="panel">
              <div className="panel-head">
                <h2>People</h2>
              </div>
              <p className="hint">
                Add another person who can sign in to this UI. Passwords are stored hashed on the
                server.
              </p>
              <ul className="activity-list">
                {!users.length ? (
                  <li className="empty">No people yet.</li>
                ) : (
                  users.map((u) => (
                    <li key={u.username}>
                      <strong>{u.username}</strong>
                      <div className="meta">
                        added {formatWhen(u.createdAt)}
                        {u.lastLoginAt ? ` · last sign-in ${formatWhen(u.lastLoginAt)}` : ""}
                      </div>
                    </li>
                  ))
                )}
              </ul>
              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  onAddUser(String(fd.get("username") || ""), String(fd.get("password") || ""));
                  e.currentTarget.reset();
                }}
              >
                <label>
                  Username
                  <input name="username" autoComplete="off" required minLength={2} />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </label>
                <div className="form-actions">
                  <button type="submit" className="btn primary">
                    Add person
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {section === "activity" ? (
            <section className="panel">
              <div className="panel-head">
                <h2>Activity log</h2>
                <button type="button" className="btn ghost" onClick={onRefreshLogs}>
                  Refresh
                </button>
              </div>
              <p className="hint">
                Sign-ins and changes made in this UI. The CLI is not recorded here.
              </p>
              <ul className="activity-list">
                {!logs.length ? (
                  <li className="empty">No activity yet.</li>
                ) : (
                  logs.map((entry, i) => {
                    const extra = [
                      entry.details?.topic,
                      entry.details?.runId,
                      entry.details?.name,
                      entry.details?.createdUsername,
                    ]
                      .filter(Boolean)
                      .map(String)
                      .join(" · ");
                    return (
                      <li key={`${entry.at}-${i}`}>
                        <strong>{activityLabel(entry.action)}</strong>
                        <div className="meta">
                          {entry.username || "—"} · {formatWhen(entry.at)}
                          {extra ? ` · ${extra}` : ""}
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          ) : null}
        </div>
      </main>

      {preview ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (previewDirty && !confirm("Discard unsaved changes?")) return;
            closePreview();
          }}
        >
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-preview-title"
          >
            <div className="modal-head">
              <div className="modal-head-copy">
                <label className="modal-name-field">
                  <span className="sr-only">Template name</span>
                  <input
                    id="template-preview-title"
                    value={previewName}
                    onChange={(e) => setPreviewName(e.target.value)}
                    disabled={previewLoading || Boolean(previewError)}
                    aria-label="Template name"
                  />
                </label>
                <p className="meta">
                  {preview.id}
                  {preview.filename ? ` · ${preview.filename}` : ""}
                  {previewDirty ? " · Unsaved changes" : ""}
                </p>
              </div>
              <div className="modal-head-actions">
                {previewMode === "source" ? (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={
                      previewLoading ||
                      previewSaving ||
                      Boolean(previewError) ||
                      !previewDirty ||
                      busy
                    }
                    onClick={() => void savePreview()}
                  >
                    {previewSaving ? "Saving…" : "Save"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    if (previewDirty && !confirm("Discard unsaved changes?")) return;
                    closePreview();
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="modal-tabs" role="tablist" aria-label="Preview mode">
              <button
                type="button"
                role="tab"
                className={previewMode === "rendered" ? "active" : ""}
                aria-selected={previewMode === "rendered"}
                onClick={() => setPreviewMode("rendered")}
              >
                Preview
              </button>
              <button
                type="button"
                role="tab"
                className={previewMode === "source" ? "active" : ""}
                aria-selected={previewMode === "source"}
                onClick={() => setPreviewMode("source")}
              >
                Source
              </button>
            </div>
            <div className="modal-body">
              {previewLoading ? (
                <p className="hint">Loading template…</p>
              ) : previewError ? (
                <p className="run-error">{previewError}</p>
              ) : previewMode === "source" ? (
                <div className="template-editor">
                  <textarea
                    className="template-source-editor"
                    value={previewDraft}
                    onChange={(e) => setPreviewDraft(e.target.value)}
                    spellCheck={false}
                    aria-label="Template markdown source"
                  />
                  {previewSaveError ? <p className="run-error">{previewSaveError}</p> : null}
                  <p className="hint">
                    Edit the markdown, then Save. Preview updates from your draft before you save.
                  </p>
                </div>
              ) : (
                <div
                  className="template-rendered prose"
                  dangerouslySetInnerHTML={{
                    __html: previewHtml || "<p class='hint'>(empty)</p>",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
