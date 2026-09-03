const state = {
  runs: [],
  templates: [],
  topics: [],
  digest: null,
  digestFilter: "all",
  selectedId: null,
  run: null,
  tab: "quality",
  busy: false,
  generateImages: false,
  hasGeminiKey: false,
  autoAcceptEnabled: false,
  autoAcceptMinScore: 80,
  stylePresets: [],
  dashboard: null,
  progress: {
    active: false,
    action: "",
    lines: [],
  },
};

const $ = (sel) => document.querySelector(sel);

const LLM_PROVIDERS = [
  {
    id: "groq",
    label: "Groq",
    defaultModel: "openai/gpt-oss-20b",
    keyLabel: "Groq API key",
    models: [
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B (free, fast)" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (higher quality, 8k TPM on free tier)" },
      { id: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyLabel: "OpenAI API key",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-2.5-flash",
    keyLabel: "Gemini API key",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  {
    id: "anthropic",
    label: "Claude",
    defaultModel: "claude-sonnet-4-0",
    keyLabel: "Anthropic API key",
    models: [
      { id: "claude-sonnet-4-0", label: "Claude Sonnet 4" },
      { id: "claude-3-5-haiku-latest", label: "Claude Haiku 3.5" },
      { id: "claude-3-5-sonnet-latest", label: "Claude Sonnet 3.5" },
    ],
  },
  {
    id: "mock",
    label: "Mock (no API)",
    defaultModel: "mock-1",
    keyLabel: "No key needed",
    models: [{ id: "mock-1", label: "Mock" }],
  },
];

function isSettingsPage() {
  return /^\/settings\/?$/.test(location.pathname);
}

function applyPage() {
  const settings = isSettingsPage();
  const home = $("#page-home");
  const settingsEl = $("#page-settings");
  if (home) home.hidden = settings;
  if (settingsEl) settingsEl.hidden = !settings;
  const title = $("#page-title");
  if (title) title.textContent = settings ? "Settings" : "Blog content runs";
  document.title = settings ? "Settings · Spanwrap Pipeline" : "Spanwrap Blog Pipeline";
  const settingsLink = $("#settings-link");
  const homeLink = $("#home-link");
  if (settingsLink) settingsLink.hidden = settings;
  if (homeLink) homeLink.hidden = !settings;
}

let setupMode = false;

function showAppShell(username) {
  const gate = $("#auth-gate");
  const shell = $("#app-shell");
  if (gate) gate.hidden = true;
  if (shell) shell.hidden = false;
  const userEl = $("#auth-user");
  const logout = $("#logout-btn");
  if (userEl) {
    userEl.hidden = !username;
    userEl.textContent = username || "";
  }
  if (logout) logout.hidden = !username;
}

function showAuthGate(setupRequired) {
  setupMode = Boolean(setupRequired);
  const gate = $("#auth-gate");
  const shell = $("#app-shell");
  if (shell) shell.hidden = true;
  if (gate) gate.hidden = false;
  const title = $("#auth-title");
  const hint = $("#auth-hint");
  const submit = $("#auth-submit");
  const pass = $("#auth-password");
  const err = $("#auth-error");
  if (title) title.textContent = setupMode ? "Create admin account" : "Sign in";
  if (hint) {
    hint.textContent = setupMode
      ? "No accounts yet. Create the first username and password for this pipeline UI."
      : "Only people with an account can use this review UI.";
  }
  if (submit) submit.textContent = setupMode ? "Create account" : "Sign in";
  if (pass) pass.autocomplete = setupMode ? "new-password" : "current-password";
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
}

async function ensureAuth() {
  const me = await fetch("/api/auth/me", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}));
  if (me.authenticated) {
    showAppShell(me.username);
    return true;
  }
  showAuthGate(me.setupRequired);
  return false;
}

function activityLabel(action) {
  return String(action || "").replace(/_/g, " ");
}

function toast(message, isError = false) {
  const el = $("#toast");
  el.hidden = false;
  el.textContent = message;
  el.style.background = isError ? "#8f2d2d" : "#1c1915";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, isError ? 14000 : 4000);
}

function toastRunResult(run, okPrefix) {
  if (run?.status === "FAILED" || run?.status === "PUBLISH_FAILED") {
    toast(run.error || "Run failed", true);
  } else {
    toast(`${okPrefix} → ${run.status}`);
  }
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/auth/me" && path !== "/api/auth/login") {
    await showAuthGate();
    throw new Error(data.error || "Sign in required");
  }
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

function statusClass(status) {
  if (["PUBLISHED", "APPROVED"].includes(status)) return "ok";
  if (["FAILED", "PUBLISH_FAILED", "CANCELLED"].includes(status)) return "bad";
  if (["REVIEW_REQUIRED", "QUALITY_CHECK", "DRAFT_READY"].includes(status)) return "warn";
  return "";
}

let llmCatalog = null;

function llmProviderList(data) {
  return data?.providers?.length ? data.providers : LLM_PROVIDERS;
}

function fillLlmForm(data) {
  const providers = llmProviderList(data);
  llmCatalog = { ...(data || {}), providers };
  const providerSel = $("#llm-provider");
  const modelSel = $("#llm-model-select");
  const customWrap = $("#llm-model-custom-wrap");
  const custom = $("#llm-model-custom");
  const keyWrap = $("#llm-key-wrap");
  const keyInput = $("#llm-api-key");
  const status = $("#llm-status");
  if (!providerSel || !modelSel) return;

  const providerId = data?.provider || providerSel.value || "groq";
  providerSel.innerHTML = providers
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === providerId ? "selected" : ""}>${escapeHtml(p.label)}</option>`,
    )
    .join("");
  providerSel.value = providers.some((p) => p.id === providerId) ? providerId : providers[0].id;

  const current = providers.find((p) => p.id === providerSel.value) || providers[0];
  const modelId = data?.model || current?.defaultModel || "";
  const known = (current?.models || []).some((m) => m.id === modelId);
  modelSel.innerHTML =
    (current?.models || [])
      .map(
        (m) =>
          `<option value="${escapeHtml(m.id)}" ${m.id === modelId ? "selected" : ""}>${escapeHtml(m.label)}</option>`,
      )
      .join("") + `<option value="__custom__" ${known ? "" : "selected"}>Custom…</option>`;
  if (customWrap && custom) {
    customWrap.hidden = known;
    if (!known) custom.value = modelId || "";
  }
  if (keyWrap) keyWrap.hidden = providerSel.value === "mock";
  if (keyInput) {
    keyInput.value = "";
    keyInput.placeholder = data?.hasKey
      ? `Saved ${data.keyPreview || "••••"} — paste to replace`
      : `Paste ${current?.keyLabel || "API key"}`;
  }
  if (status) {
    const remap = data?.remappedFrom
      ? ` · remapped ${data.remappedFrom} → ${data.model}`
      : "";
    status.textContent = data?.hasKey
      ? `${data.provider} · ${data.model}${remap}`
      : "No key — using mock until you paste one";
  }
}

function selectedLlmModel() {
  const modelSel = $("#llm-model-select");
  const custom = $("#llm-model-custom");
  if (modelSel?.value === "__custom__") return String(custom?.value || "").trim();
  return String(modelSel?.value || "").trim();
}

async function loadLlm() {
  try {
    const data = await api("/api/llm");
    fillLlmForm(data);
    return data;
  } catch (error) {
    fillLlmForm({
      provider: "groq",
      model: "openai/gpt-oss-20b",
      hasKey: false,
      providers: LLM_PROVIDERS,
    });
    throw error;
  }
}

async function loadHealth() {
  try {
    const h = await api("/api/health");
    state.hasGeminiKey = Boolean(h.hasGeminiKey);
    state.autoAcceptEnabled = Boolean(h.autoAcceptEnabled);
    state.autoAcceptMinScore = Number(h.autoAcceptMinScore) || 80;
    const rows = [
      ["storage", h.storage],
      ["llm", h.hasLlmKey ? `${h.llmProvider} · ${h.llmModel || ""}`.trim() : `${h.llmProvider} (no key → mock)`],
      ["research", h.researchProvider],
      ["publish key", h.hasSpanwrapKey ? "set" : "missing"],
      ["gemini images", h.hasGeminiKey ? "key set" : "no key"],
      [
        "auto-accept",
        h.autoAcceptEnabled ? `on (≥${h.autoAcceptMinScore})` : "off",
      ],
      ["github", h.hasGithubToken ? "token" : "public"],
      ["reddit", h.hasRedditOAuth ? "oauth" : "public"],
      ["x", h.hasXBearer ? "api" : "off"],
    ];
    const dl = $("#settings-health");
    if (dl) {
      dl.innerHTML = rows
        .map(
          ([k, v]) =>
            `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`,
        )
        .join("");
    }
  } catch (e) {
    const msg = e.message;
    const dl = $("#settings-health");
    if (dl) dl.innerHTML = `<div><dt>error</dt><dd>${escapeHtml(msg)}</dd></div>`;
  }
}

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function digestScoreLabel(item) {
  const score = item.score ?? 0;
  const extra = item.comments ?? 0;
  if (item.platform === "github") {
    const today = String(item.community || "").match(/([\d,]+)\s+stars today/i);
    if (today) return `${today[1]} stars today`;
    return `${score.toLocaleString()} stars · ${extra.toLocaleString()} forks`;
  }
  if (item.platform === "reddit") {
    return `${score.toLocaleString()} upvotes · ${extra.toLocaleString()} comments`;
  }
  if (item.platform === "arxiv") return "new paper";
  if (item.platform === "huggingface") return `${score.toLocaleString()} upvotes`;
  if (item.platform === "news") return item.community || "press";
  return `${score.toLocaleString()} score`;
}

function sourceIcon(platform) {
  const icons = {
    github:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>',
    reddit:
      '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M16.5 10.2a1.5 1.5 0 0 0-2.55-1.07 7.4 7.4 0 0 0-3.7-1.17l.63-3 2.05.44a1.2 1.2 0 1 0 .12-.56l-2.3-.5a.5.5 0 0 0-.58.38l-.72 3.4a7.4 7.4 0 0 0-3.82 1.18 1.5 1.5 0 1 0-1.66 2.4c-.05.28-.08.56-.08.85 0 2.43 2.83 4.4 6.31 4.4s6.31-1.97 6.31-4.4c0-.27-.03-.54-.07-.8a1.5 1.5 0 0 0 .96-1.38Z"/></svg>',
    x: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12.6.75h2.45l-5.36 6.13L16 15.25h-4.94L7.6 10.14 3.16 15.25H.7l5.73-6.55L0 .75h5.06l3.4 4.6L12.6.75Zm-.86 13.07h1.36L4.32 2.13H2.86l8.88 11.69Z"/></svg>',
    hackernews:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#ff6600"/><path fill="#fff" d="M4.4 3.2h2.1l1.5 3.1 1.5-3.1h2.1L8.9 8.1V12.8H7.1V8.1L4.4 3.2Z"/></svg>',
    devto:
      '<svg viewBox="0 0 32 16" width="22" height="14" aria-hidden="true"><text x="0" y="13" fill="currentColor" font-size="12" font-weight="700" font-family="ui-sans-serif,system-ui">DEV</text></svg>',
    arxiv:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#b31b1b"/><path fill="#fff" d="M4 4.2h8v1.4H5.7V7.4h5.6v1.3H5.7v3.1H4V4.2Z"/></svg>',
    huggingface:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#ffd21e" stroke="#1c1915" stroke-width="1"/><circle cx="5.6" cy="6.6" r="1.1" fill="#1c1915"/><circle cx="10.4" cy="6.6" r="1.1" fill="#1c1915"/><path d="M5.2 10c.8 1.3 4.8 1.3 5.6 0" fill="none" stroke="#1c1915" stroke-width="1.2" stroke-linecap="round"/></svg>',
    lobsters:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#ac130d"/><text x="3" y="12" fill="#fff" font-size="9" font-weight="700" font-family="ui-sans-serif,system-ui">L</text></svg>',
    news:
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2 2.5h9.5A2.5 2.5 0 0 1 14 5v8.5H4.5A2.5 2.5 0 0 1 2 11V2.5Zm1.5 1.5v7A1 1 0 0 0 4.5 12H12.5V5A1 1 0 0 0 11.5 4H3.5ZM5 6h6v1.2H5V6Zm0 2.2h6V9.4H5V8.2Z"/></svg>',
  };
  const svg = icons[platform] || "";
  const labels = {
    github: "GitHub",
    reddit: "Reddit",
    x: "X",
    hackernews: "Hacker News",
    devto: "Dev.to",
    arxiv: "arXiv",
    huggingface: "Hugging Face",
    lobsters: "Lobsters",
    news: "Tech press",
  };
  const label = labels[platform] || platform;
  return `<span class="source-badge" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${svg}</span>`;
}

function digestItems() {
  const digest = state.digest;
  if (!digest || digest === "loading") return [];
  return [...(digest.github || []), ...(digest.reddit || []), ...(digest.x || []), ...(digest.more || [])];
}

function digestCard(item) {
  const title = encodeURIComponent(item.title || "");
  const url = encodeURIComponent(item.url || "");
  const description = encodeURIComponent(item.description || "");
  return `
    <li class="hot-item" data-platform="${escapeHtml(item.platform || "")}">
      <div class="hot-item-head">
        <a class="topic-title" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
        ${sourceIcon(item.platform)}
      </div>
      ${
        item.imageUrl
          ? `<img class="topic-thumb" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
          : ""
      }
      <p class="hot-item-desc">${escapeHtml(item.description || "")}</p>
      <div class="meta">
        <span>${escapeHtml(item.community || item.platform || "")}</span>
        <span>${digestScoreLabel(item)}</span>
      </div>
      <div class="actions-row">
        <button type="button" class="btn primary" data-digest-title="${title}" data-digest-url="${url}" data-digest-description="${description}">Write this</button>
      </div>
    </li>`;
}

function renderSourceFilters(items) {
  const root = $("#source-filters");
  if (!root) return;
  const counts = {};
  for (const item of items) {
    const key = item.platform || "other";
    counts[key] = (counts[key] || 0) + 1;
  }
  const chips = [
    { id: "all", label: "All", count: items.length },
    { id: "github", label: "GitHub", count: counts.github || 0 },
    { id: "reddit", label: "Reddit", count: counts.reddit || 0 },
    { id: "x", label: "X", count: counts.x || 0 },
    { id: "hackernews", label: "HN", count: counts.hackernews || 0 },
    { id: "devto", label: "Dev.to", count: counts.devto || 0 },
    { id: "arxiv", label: "arXiv", count: counts.arxiv || 0 },
    { id: "huggingface", label: "HF papers", count: counts.huggingface || 0 },
    { id: "lobsters", label: "Lobsters", count: counts.lobsters || 0 },
    { id: "news", label: "Press", count: counts.news || 0 },
  ].filter((c) => c.id === "all" || c.count > 0);
  if (state.digestFilter !== "all" && !chips.some((c) => c.id === state.digestFilter)) {
    state.digestFilter = "all";
  }
  root.innerHTML = chips
    .map(
      (c) =>
        `<button type="button" class="source-filter ${state.digestFilter === c.id ? "active" : ""}" data-filter="${c.id}">${escapeHtml(c.label)} · ${c.count}</button>`,
    )
    .join("");
  root.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.digestFilter = btn.dataset.filter || "all";
      renderDigest();
    });
  });
}

function bindDigestWrite(root) {
  root.querySelectorAll("[data-digest-title]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      setBusy(true);
      try {
        const templateId = $("#template-select")?.value || null;
        const result = await api("/api/digest/start-run", {
          method: "POST",
          body: JSON.stringify({
            title: decodeURIComponent(btn.dataset.digestTitle || ""),
            url: decodeURIComponent(btn.dataset.digestUrl || ""),
            description: decodeURIComponent(btn.dataset.digestDescription || ""),
            templateId,
          }),
        });
        toast(`Created run ${result.run.id}`);
        await loadRuns();
        state.selectedId = result.run.id;
        state.run = result.run;
        renderList();
        renderDetail();
        document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        toast(e.message, true);
      } finally {
        setBusy(false);
      }
    });
  });
}

function renderDigest() {
  const list = $("#topic-list");
  const notes = $("#digest-notes");
  const updated = $("#digest-updated");
  if (!list) return;
  const digest = state.digest;
  if (digest === "loading") {
    list.innerHTML = `<li class="empty">Loading GitHub, Reddit, HN, arXiv, Hugging Face, and tech press…</li>`;
    if (notes) notes.hidden = true;
    if (updated) updated.textContent = "Loading feeds…";
    renderSourceFilters([]);
    return;
  }
  if (!digest) {
    list.innerHTML = `<li class="empty">Could not load topics. Click Refresh to try again.</li>`;
    if (notes) notes.hidden = true;
    if (updated) updated.textContent = "Not loaded";
    renderSourceFilters([]);
    return;
  }
  if (updated) {
    updated.textContent = digest.generatedAt ? `Updated ${formatWhen(digest.generatedAt)}` : "Ready";
  }
  if (notes) {
    notes.hidden = !(digest.notes && digest.notes.length);
    notes.textContent = (digest.notes || []).join(" ");
  }
  const items = digestItems();
  renderSourceFilters(items);
  const filtered =
    state.digestFilter === "all" ? items : items.filter((i) => i.platform === state.digestFilter);
  list.innerHTML = filtered.length
    ? filtered.map(digestCard).join("")
    : `<li class="empty">No topics for this source yet.</li>`;
  bindDigestWrite(list);
}

async function loadDigest(opts = {}) {
  state.digest = "loading";
  renderDigest();
  try {
    state.digest = await api("/api/digest", {
      method: "POST",
      body: JSON.stringify({ refresh: Boolean(opts.refresh) }),
    });
  } catch (error) {
    state.digest = null;
    renderDigest();
    throw error;
  }
  renderDigest();
}

async function loadTopics() {
  try {
    state.topics = await api("/api/topics");
  } catch {
    state.topics = [];
  }
  renderTopics();
}

function renderTopics() {
  const list = $("#topic-list");
  if (!list) return;
  if (!state.topics.length) {
    list.innerHTML = `<li class="empty">No recommendations yet. Click Discover.</li>`;
    return;
  }
  list.innerHTML = state.topics
    .map(
      (t) => `
    <li>
      ${
        t.signals?.find((s) => s.imageUrl)?.imageUrl
          ? `<img class="topic-thumb" src="${escapeHtml(t.signals.find((s) => s.imageUrl).imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
          : ""
      }
      <div class="topic-title">${escapeHtml(t.topic)}</div>
      <div class="meta">
        <span class="heat">heat ${t.heatScore}</span>
        <span>${escapeHtml((t.platforms || []).join(", "))}</span>
        <span>${escapeHtml((t.keywords || []).slice(0, 4).join(" · "))}</span>
      </div>
      <div style="color:var(--muted);font-size:0.85rem">${escapeHtml(t.whyItMatters || t.blogAngle || "")}</div>
      <div class="actions-row">
        <button type="button" class="btn primary" data-start-topic="${t.id}">Write this</button>
        ${
          t.signals?.[0]?.url
            ? `<a class="btn ghost" href="${escapeHtml(t.signals[0].url)}" target="_blank" rel="noreferrer">Source</a>`
            : ""
        }
      </div>
    </li>`,
    )
    .join("");

  list.querySelectorAll("[data-start-topic]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      setBusy(true);
      try {
        const templateId = $("#template-select")?.value || null;
        const result = await api(
          `/api/topics/${encodeURIComponent(btn.dataset.startTopic)}/start-run`,
          {
            method: "POST",
            body: JSON.stringify({ templateId }),
          },
        );
        toast(`Created run ${result.run.id}`);
        await loadRuns();
        state.selectedId = result.run.id;
        state.run = result.run;
        renderList();
        renderDetail();
        document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        toast(e.message, true);
      } finally {
        setBusy(false);
      }
    });
  });
}

async function loadTemplates() {
  state.templates = await api("/api/templates");
  const options =
    `<option value="">None (default structure)</option>` +
    state.templates
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
      .join("");
  for (const sel of ["#template-select", "#runs-template"]) {
    const select = $(sel);
    if (!select) continue;
    const current = select.value;
    select.innerHTML = options;
    if (current && state.templates.some((t) => t.id === current)) {
      select.value = current;
    }
  }
  try {
    const data = await api("/api/style-presets");
    state.stylePresets = data.presets || [];
    const presetSel = $("#style-preset-select");
    if (presetSel) {
      const remembered = data.memory?.lastStylePresetId || "";
      presetSel.innerHTML =
        `<option value="">Default (use tone field)</option>` +
        state.stylePresets
          .map(
            (p) =>
              `<option value="${escapeHtml(p.id)}" ${p.id === remembered ? "selected" : ""}>${escapeHtml(p.label)}</option>`,
          )
          .join("");
    }
  } catch {
    /* optional */
  }
  const list = $("#template-list");
  if (!list) return;
  if (!state.templates.length) {
    list.innerHTML = `<li class="empty">No templates uploaded yet.</li>`;
    return;
  }
  list.innerHTML = state.templates
    .map(
      (t) => `
    <li>
      <div>
        <strong>${escapeHtml(t.name)}</strong>
        <div class="meta">${escapeHtml(t.id)} · ${escapeHtml(t.filename || "pasted")}${
          t.chars
            ? ` · ~${Math.ceil(t.chars / 4)} tokens`
            : ""
        }</div>
      </div>
      <button type="button" class="btn ghost" data-del-tpl="${t.id}">Delete</button>
    </li>`,
    )
    .join("");
  list.querySelectorAll("[data-del-tpl]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this template?")) return;
      try {
        await api(`/api/templates/${encodeURIComponent(btn.dataset.delTpl)}`, {
          method: "DELETE",
        });
        toast("Template deleted");
        await loadTemplates();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}

async function loadRuns() {
  state.runs = await api("/api/runs");
  try {
    state.dashboard = await api("/api/dashboard");
  } catch {
    state.dashboard = null;
  }
  renderList();
  if (state.selectedId) {
    const still = state.runs.find((r) => r.id === state.selectedId);
    if (!still) {
      state.selectedId = null;
      state.run = null;
      renderDetail();
    }
  }
}

function renderList() {
  const list = $("#run-list");
  const dash = $("#resume-dashboard");
  if (dash && state.dashboard?.buckets?.length) {
    dash.innerHTML = `<div class="dash-title">Smart resume</div>${state.dashboard.buckets
      .map(
        (b) =>
          `<button type="button" class="dash-bucket" data-dash-ids="${escapeHtml(b.runIds.join(","))}"><strong>${escapeHtml(b.label)}</strong> <span>${b.count}</span></button>`,
      )
      .join("")}`;
    dash.querySelectorAll("[data-dash-ids]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = String(btn.dataset.dashIds || "").split(",")[0];
        if (id) selectRun(id);
      });
    });
  } else if (dash) {
    dash.innerHTML = "";
  }
  if (!list) return;
  if (!state.runs.length) {
    list.innerHTML = `<li class="empty">No runs yet.</li>`;
    return;
  }
  list.innerHTML = state.runs
    .map(
      (r) => `
      <li>
        <button type="button" data-id="${r.id}" class="run-select-btn ${r.id === state.selectedId ? "active" : ""}">
          <span class="topic">${escapeHtml(r.topic)}</span>
          <span class="meta">
            <span class="status ${statusClass(r.status)}">${r.status}</span>
            ${r.autoAccepted ? `<span class="retryable-badge">auto</span>` : ""}
            <span>${r.id}</span>
          </span>
        </button>
        <button type="button" data-delete-id="${r.id}" class="run-delete-btn" title="Delete run">🗑️</button>
      </li>`,
    )
    .join("");
    
  list.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectRun(btn.dataset.id));
  });
  
  list.querySelectorAll("button[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Are you sure you want to delete this run?")) return;
      try {
        const id = btn.dataset.deleteId;
        await api(`/api/runs/${encodeURIComponent(id)}`, { method: "DELETE" });
        toast("Run deleted successfully");
        if (state.selectedId === id) {
          state.selectedId = null;
          state.run = null;
          renderDetail();
        }
        await loadRuns();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

async function selectRun(id) {
  state.selectedId = id;
  renderList();
  state.run = await api(`/api/runs/${encodeURIComponent(id)}`);
  renderDetail();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setBusy(busy) {
  state.busy = busy;
  document
    .querySelectorAll(
      ".actions .btn, .form-actions .btn, .template-bar .btn, #load-digest, #runs-write, #save-llm",
    )
    .forEach((b) => {
      b.disabled = busy;
    });
}

const PUBLISH_SITES = [
  { id: "spanwrap", label: "Spanwrap", note: "Live HTTP publish" },
  { id: "medium", label: "Medium", note: "Planned" },
  { id: "substack", label: "Substack", note: "Planned" },
];

const TAB_LABELS = {
  quality: "Quality",
  article: "Preview",
  publish: "Publish",
  seo: "SEO pack",
  facts: "Fact cards",
  diff: "Diff",
  repurpose: "Repurpose",
  outline: "Outline",
  template: "Template",
  sources: "Sources",
  analysis: "Analysis",
  stages: "Stages",
  raw: "Raw",
};

function selectedTargets(run) {
  return Array.isArray(run.publishTargets) && run.publishTargets.length
    ? run.publishTargets
    : ["spanwrap"];
}

function collectReviewPayload(root, run) {
  const a = run.article;
  if (!a) throw new Error("No article to save");
  const title = String(root.querySelector("#draft-title")?.value || "").trim();
  const excerpt = String(root.querySelector("#draft-excerpt")?.value || "").trim();
  const content = getEditorContent(root).trim();
  const featured = String(root.querySelector("#draft-featured")?.value || "").trim();
  const publishTargets = [...root.querySelectorAll("input[name=publish-target]:checked")].map(
    (el) => el.value,
  );
  if (!title) throw new Error("Title is required");
  if (!excerpt) throw new Error("Excerpt is required");
  if (!content) throw new Error("Body is required");
  if (!publishTargets.length) throw new Error("Select at least one publishing site");
  return {
    article: {
      ...a,
      title,
      excerpt,
      content,
      featuredImage: featured || null,
      seoTitle: a.seoTitle || title,
      seoDescription: a.seoDescription || excerpt,
    },
    publishTargets,
  };
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const next = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  textarea.value = next;
  const caret = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = caret;
  textarea.focus();
}

function wantsImages() {
  const box = $("#generate-images-flag");
  if (box) state.generateImages = box.checked && !box.disabled;
  return Boolean(state.generateImages && state.hasGeminiKey);
}

function stageLabel(stage) {
  return (
    {
      research: "Gathering resources...",
      analysis: "Analyzing sources...",
      outline: "Drafting the outline...",
      generation: "Writing the article...",
      images: "Generating images with Gemini...",
      quality: "Scoring quality...",
      publish: "Publishing...",
    }[stage] || `${stage}...`
  );
}

function pushProgress(text) {
  const last = state.progress.lines[state.progress.lines.length - 1];
  if (last?.text === text) return;
  state.progress.lines = [
    ...state.progress.lines,
    { at: new Date().toLocaleTimeString(), text },
  ].slice(-12);
  const root = $("#action-progress-list");
  if (!root) return;
  root.innerHTML = state.progress.lines
    .map((line) => `<li><span>${escapeHtml(line.at)}</span> ${escapeHtml(line.text)}</li>`)
    .join("");
}

function startProgress(action) {
  state.progress.active = true;
  state.progress.action = action;
  state.progress.lines = [];
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
}

function stopProgress(success, message) {
  pushProgress(message || (success ? "Completed." : "Failed."));
  state.progress.active = false;
}

function startStagePoll() {
  let lastKey = "";
  return setInterval(async () => {
    if (!state.selectedId) return;
    try {
      const latest = await api(`/api/runs/${encodeURIComponent(state.selectedId)}`);
      const running = (latest.stages || []).find((s) => s.status === "running");
      const key = running ? `run:${running.stage}` : `status:${latest.status}:${latest.error || ""}`;
      if (key === lastKey) return;
      lastKey = key;
      if (running) pushProgress(stageLabel(running.stage));
      else if (latest.error) pushProgress(latest.error);
    } catch {
      /* ignore poll errors */
    }
  }, 1200);
}

async function act(action, body) {
  if (!state.selectedId || state.busy) return null;
  if (action === "run") {
    return runToReview(body);
  }
  const payload = {
    ...(body || {}),
    generateImages: wantsImages(),
  };
  setBusy(true);
  startProgress(action);
  const poller = startStagePoll();
  try {
    state.run = await api(`/api/runs/${encodeURIComponent(state.selectedId)}/${action}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    stopProgress(
      !["FAILED", "PUBLISH_FAILED"].includes(state.run.status),
      state.run.error
        ? `${action} failed: ${state.run.error}`
        : `${action} completed → ${state.run.status}`,
    );
    toastRunResult(state.run, `${action} complete`);
    if (state.run?.article && ["generate", "quality-check", "accept-stream-draft"].includes(action)) {
      state.tab = "quality";
    }
    if (action === "approve") {
      state.tab = "publish";
    }
    await loadRuns();
    renderDetail();
    return state.run;
  } catch (e) {
    stopProgress(false, e.message || "Action failed.");
    toast(e.message, true);
    try {
      if (state.selectedId) {
        state.run = await api(`/api/runs/${encodeURIComponent(state.selectedId)}`);
        renderDetail();
      }
    } catch {
      /* keep current */
    }
    return null;
  } finally {
    clearInterval(poller);
    setBusy(false);
  }
}

/** Full pipeline through quality. Resumes if previous run FAILED. */
async function runToReview(body = {}) {
  if (!state.selectedId || state.busy) return null;
  const generateImages = wantsImages();
  setBusy(true);
  startProgress("run");
  const poller = startStagePoll();
  try {
    pushProgress(
      state.run?.status === "FAILED"
        ? `Resuming from failed stage (${state.run.failedStage || "unknown"})...`
        : "Starting full pipeline (research → draft → quality)...",
    );

    state.run = await api(`/api/runs/${encodeURIComponent(state.selectedId)}/run`, {
      method: "POST",
      body: JSON.stringify({
        ...body,
        generateImages,
      }),
    });
    stopProgress(
      state.run.status !== "FAILED",
      state.run.error || `Run finished → ${state.run.status}`,
    );
    toastRunResult(state.run, "Run complete");
    if (state.run?.article) state.tab = "quality";
    await loadRuns();
    renderDetail();
    return state.run;
  } catch (e) {
    stopProgress(false, e.message || "Run failed.");
    toast(e.message, true);
    try {
      if (state.selectedId) {
        state.run = await api(`/api/runs/${encodeURIComponent(state.selectedId)}`);
        renderDetail();
      }
    } catch {
      /* keep */
    }
    return null;
  } finally {
    clearInterval(poller);
    setBusy(false);
  }
}

function formBrief(form) {
  const fd = new FormData(form);
  return {
    topic: String(fd.get("topic") || "").trim(),
    targetAudience: String(fd.get("targetAudience") || "").trim(),
    tone: String(fd.get("tone") || "").trim(),
    keywords: String(fd.get("keywords") || ""),
    templateId: String(fd.get("templateId") || "") || null,
    stylePresetId: String(fd.get("stylePresetId") || "") || null,
  };
}

async function createRun(andRun) {
  if (state.busy) return;
  const form = $("#create-form");
  const brief = formBrief(form);
  if (!brief.topic || brief.topic.length < 3) {
    toast("Topic is required (at least 3 characters)", true);
    return;
  }
  setBusy(true);
  try {
    const run = await api("/api/runs", { method: "POST", body: JSON.stringify(brief) });
    toast(`Created ${run.id}`);
    form.reset();
    form.elements.targetAudience.value = "startup founders";
    form.elements.tone.value = "technical but easy to understand";
    await loadRuns();
    state.selectedId = run.id;
    state.run = run;
    renderList();
    renderDetail();
  } catch (e) {
    toast(e.message, true);
    return;
  } finally {
    setBusy(false);
  }
  if (andRun) await act("run");
}

function renderDetail() {
  const root = $("#detail");
  const run = state.run;
  if (!run) {
    root.innerHTML = `<p class="empty">Select a run to inspect sources, outline, article, and actions.</p>`;
    return;
  }

  const tabs = [
    "quality",
    "article",
    "seo",
    "facts",
    "diff",
    "repurpose",
    "publish",
    "outline",
    "template",
    "sources",
    "analysis",
    "stages",
    "raw",
  ];
  const content = renderTab(run, state.tab);
  const templateOptions = [
    `<option value="">None (default structure)</option>`,
    ...state.templates.map(
      (t) =>
        `<option value="${t.id}" ${run.templateId === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`,
    ),
  ].join("");

  const retryStageLabel = run.failedStage
    ? run.failedStage.charAt(0).toUpperCase() + run.failedStage.slice(1)
    : null;
  const retryBtn = run.retryable && run.failedStage
    ? `<button class="btn" data-act="${escapeHtml(run.failedStage === 'research' ? 'research' : run.failedStage === 'outline' ? 'outline' : run.failedStage === 'generation' ? 'generate' : run.failedStage === 'quality' ? 'quality-check' : 'run')}" title="Retry from the failed stage">⟳ Retry ${escapeHtml(retryStageLabel)}</button>`
    : "";

  root.innerHTML = `
    <div class="detail-head">
      <div>
        <p class="brand">${escapeHtml(run.id)}</p>
        <h2>${escapeHtml(run.brief.topic)}</h2>
        <p class="meta-line">
          <span class="status ${statusClass(run.status)}">${run.status}</span>
          ${run.templateName ? ` · template: ${escapeHtml(run.templateName)}` : " · no template"}
          ${run.quality ? ` · quality ${run.quality.score} (${run.quality.passed ? "pass" : "flag"})` : ""}
        </p>
        ${run.error ? `<div class="run-error-block">
          <p class="run-error">${escapeHtml(run.error)}</p>
          ${run.failedStage ? `<p class="run-error-meta">Stage: <strong>${escapeHtml(retryStageLabel)}</strong>${run.errorCode ? ` · Code: <code>${escapeHtml(run.errorCode)}</code>` : ""}${run.retryable ? " · <span class=\"retryable-badge\">Retryable</span>" : ""}</p>` : ""}
          ${retryBtn}
        </div>` : ""}
      </div>
    </div>
    <div class="template-bar">
      <label>
        Assign template
        <select id="detail-template">${templateOptions}</select>
      </label>
      <button type="button" class="btn primary" id="assign-template">Assign template</button>
    </div>
    <p class="hint">
      <strong>Run to review</strong> runs research → outline → draft → quality.
      If a run failed, it resumes from the failed stage. Tabs below inspect/edit results — select text in Quality to Quick Edit.
      ${state.hasGeminiKey ? " Enable Gemini images to generate art with the draft." : ""}
    </p>
    <div class="actions">
      <button class="btn primary" data-act="run">Run to review</button>
      <label class="check-inline" title="${state.hasGeminiKey ? "Generate hero/section images with Gemini after the draft" : "Add GEMINI_API_KEY in .env to enable"}">
        <input type="checkbox" id="generate-images-flag" ${state.hasGeminiKey ? "" : "disabled"} ${state.generateImages && state.hasGeminiKey ? "checked" : ""} />
        Gemini images
      </label>
      <button class="btn" data-act="publish-preview">Open publish</button>
      <button class="btn" data-act="distribute" title="Approve + publish + build social/newsletter pack">One-click distribute</button>
      <button class="btn" data-act="readability-pass">Readability pass</button>
      ${run.status === "PUBLISHED" || run.status === "APPROVED" ? `<button class="btn" data-act="refresh">Refresh post</button>` : ""}
    </div>
    <details class="stage-actions">
      <summary>Run one stage (advanced)</summary>
      <p class="hint">Use only to retry a single step after a failure. Prefer <strong>Run to review</strong> for a full draft.</p>
      <div class="actions">
        <button class="btn" data-act="research">Research</button>
        <button class="btn" data-act="outline">Outline</button>
        <button class="btn" data-act="generate">Generate</button>
        <button class="btn" data-act="quality-check">Quality score</button>
      </div>
    </details>
    <div class="progress-panel">
      <div class="progress-head">
        <strong>Pipeline activity</strong>
        ${
          state.progress.active
            ? `<span class="status warn">Running ${escapeHtml(state.progress.action)}</span>`
            : `<span class="status">Idle</span>`
        }
      </div>
      <ul id="action-progress-list" class="action-progress-list">
        ${
          state.progress.lines.length
            ? state.progress.lines
                .map((line) => `<li><span>${escapeHtml(line.at)}</span> ${escapeHtml(line.text)}</li>`)
                .join("")
            : `<li class="empty">No activity yet.</li>`
        }
      </ul>
    </div>
    <div class="tabs">
      ${tabs
        .map(
          (t) =>
            `<button type="button" data-tab="${t}" class="${state.tab === t ? "active" : ""}">${TAB_LABELS[t] || t}</button>`,
        )
        .join("")}
    </div>
    <div class="section">${content}</div>
  `;

  const genImagesFlag = root.querySelector("#generate-images-flag");
  if (genImagesFlag) {
    genImagesFlag.addEventListener("change", () => {
      state.generateImages = genImagesFlag.checked && !genImagesFlag.disabled;
      try {
        localStorage.setItem("pipeline.generateImages", state.generateImages ? "1" : "0");
      } catch {
        /* ignore */
      }
    });
  }
  root.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.act;
      if (action === "publish-preview") {
        state.tab = "publish";
        renderDetail();
        return;
      }
      if (action === "approve" || action === "reject") {
        const notes = prompt(`${action} notes (optional)`) ?? undefined;
        await act(action, notes ? { notes } : {});
      } else {
        await act(action);
      }
    });
  });
  root.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      renderDetail();
    });
  });
  const saveOutline = root.querySelector("#save-outline");
  if (saveOutline) {
    saveOutline.addEventListener("click", async () => {
      try {
        const outline = JSON.parse(root.querySelector("#outline-json").value);
        await act("outline-update", { outline });
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
  const saveArticle = root.querySelector("#save-article");
  if (saveArticle) {
    saveArticle.addEventListener("click", async () => {
      try {
        const article = JSON.parse(root.querySelector("#article-json").value);
        await act("article-update", { article });
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
  const assignTpl = root.querySelector("#assign-template");
  if (assignTpl) {
    assignTpl.addEventListener("click", async () => {
      const templateId =
        root.querySelector("#detail-template")?.value ||
        root.querySelector("#run-template")?.value ||
        null;
      await act("assign-template", { templateId });
    });
  }
  const confirmPublish = root.querySelector("#confirm-publish");
  if (confirmPublish) {
    confirmPublish.addEventListener("click", async () => {
      await act("publish");
    });
  }
  root.querySelectorAll("[data-regen-section]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await act("regenerate-section", { heading: btn.dataset.regenSection });
      state.tab = "article";
    });
  });
  root.querySelectorAll("[data-seo-title]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await act("apply-seo", { title: btn.dataset.seoTitle });
      toast("SEO title applied");
    });
  });
  root.querySelectorAll("[data-seo-desc]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await act("apply-seo", { description: btn.dataset.seoDesc });
      toast("Meta description applied");
    });
  });
  root.querySelectorAll("[data-seo-slug]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await act("apply-seo", { slug: btn.dataset.seoSlug });
      toast("Slug applied");
    });
  });
  root.querySelectorAll('input[name="thumb"]').forEach((input) => {
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      await act("select-thumbnail", { variantId: input.value });
    });
  });
  const loadDiff = root.querySelector("#load-diff");
  const diffMount = root.querySelector("#diff-mount");
  async function renderDiffMount() {
    if (!diffMount || !run.id) return;
    try {
      const diff = await api(`/api/runs/${encodeURIComponent(run.id)}/diff`, {
        method: "POST",
        body: "{}",
      });
      const hunks = diff.hunks || [];
      if (!hunks.length) {
        diffMount.innerHTML = `<p class="empty">No line differences recorded.</p>`;
        return;
      }
      diffMount.innerHTML = hunks
        .slice(0, 500)
        .map((h) => {
          const cls = h.type === "add" ? "diff-add" : h.type === "del" ? "diff-del" : "diff-same";
          return `<div class="${cls}"><code>${escapeHtml(h.text || " ")}</code></div>`;
        })
        .join("");
    } catch (e) {
      diffMount.innerHTML = `<p class="empty">${escapeHtml(e.message || "Diff failed")}</p>`;
    }
  }
  if (diffMount) {
    void renderDiffMount();
  }
  if (loadDiff) {
    loadDiff.addEventListener("click", () => {
      void renderDiffMount();
    });
  }
  bindQualityEditor(root, run);
}

function featuredImageFor(run, articleOverride) {
  const a = articleOverride || run.article;
  if (!a) return null;
  if (a.featuredImage && /^https?:\/\//i.test(a.featuredImage)) return a.featuredImage;
  const md = String(a.content || "").match(/!\[[^\]]*]\(\s*(https?:\/\/[^)\s]+)\s*\)/);
  if (md?.[1]) return md[1];
  const gh = (a.sources || [])
    .map((s) => s.url)
    .find((u) => /github\.com\/[^/]+\/[^/]+/i.test(u || ""));
  if (gh) {
    const m = gh.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (m) return `https://opengraph.githubassets.com/1/${m[1]}/${m[2]}`;
  }
  return null;
}

function renderPostArticle(run, article) {
  const a = article || run.article;
  if (!a) return `<p class="empty">No draft yet.</p>`;
  const hero = featuredImageFor(run, a);
  return `
    <article class="post-preview">
      <p class="post-kicker">${escapeHtml(a.slug || "")} · ${escapeHtml((a.tags || []).join(" · "))}</p>
      ${
        hero
          ? `<img class="post-hero" src="${escapeHtml(hero)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
          : ""
      }
      <h1>${escapeHtml(a.title)}</h1>
      ${a.subtitle ? `<p class="post-dek">${escapeHtml(a.subtitle)}</p>` : ""}
      <p class="post-excerpt">${escapeHtml(a.excerpt || "")}</p>
      <div class="post-body">${markdownToEditorHtml(a.content)}</div>
      ${
        (a.sources || []).length
          ? `<aside class="post-sources"><h3>Sources</h3><ul>${a.sources
              .map(
                (s) =>
                  `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.title || s.url)}</a></li>`,
              )
              .join("")}</ul></aside>`
          : ""
      }
    </article>`;
}

function liveDraftFromEditor(root, run) {
  const a = run.article;
  if (!a) return null;
  const editorContent = getEditorContent(root);
  return {
    ...a,
    title: String(root.querySelector("#draft-title")?.value || a.title),
    excerpt: String(root.querySelector("#draft-excerpt")?.value || a.excerpt),
    content: editorContent || a.content,
    featuredImage: String(root.querySelector("#draft-featured")?.value || "").trim() || a.featuredImage,
  };
}

function refreshQualityPreview(root, run) {
  const mount = root.querySelector("#quality-preview-mount");
  if (!mount) return;
  const live = liveDraftFromEditor(root, run);
  mount.innerHTML = renderPostArticle(run, live);
}

function bindQualityEditor(root, run) {
  const previewInputs = root.querySelectorAll("#draft-title, #draft-excerpt, #draft-featured");
  previewInputs.forEach((el) => {
    el.addEventListener("input", () => refreshQualityPreview(root, run));
  });
  // Initialize rich text editor
  initRichEditor(root, run);
  const insertImage = root.querySelector("#insert-image");
  if (insertImage) {
    insertImage.addEventListener("click", () => {
      const url = String(root.querySelector("#image-url")?.value || "").trim();
      const alt = String(root.querySelector("#image-alt")?.value || "Image").trim() || "Image";
      const editor = root.querySelector("#draft-content-editor");
      if (!url || !/^https?:\/\//i.test(url)) {
        toast("Enter an http(s) image URL", true);
        return;
      }
      if (editor) {
        editor.focus();
        document.execCommand("insertHTML", false,
          `<figure class="post-figure"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" /><figcaption>${escapeHtml(alt)}</figcaption></figure>`);
      }
      const featured = root.querySelector("#draft-featured");
      if (featured && !String(featured.value || "").trim()) featured.value = url;
      refreshQualityPreview(root, run);
    });
  }
  const saveReview = root.querySelector("#save-review");
  if (saveReview) {
    saveReview.addEventListener("click", async () => {
      try {
        await act("save-review", collectReviewPayload(root, run));
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
  const approveReview = root.querySelector("#approve-review");
  if (approveReview) {
    approveReview.addEventListener("click", async () => {
      try {
        const saved = await act("save-review", collectReviewPayload(root, run));
        if (!saved) return;
        const notes = prompt("Approve notes (optional)") ?? undefined;
        await act("approve", notes ? { notes } : {});
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
  const rejectReview = root.querySelector("#reject-review");
  if (rejectReview) {
    rejectReview.addEventListener("click", async () => {
      const notes = prompt("Reject notes (optional)") ?? undefined;
      await act("reject", notes ? { notes } : {});
    });
  }
}

function renderMarkdown(md) {
  const escaped = escapeHtml(md || "");
  const blocks = escaped
    .replace(/```[\s\S]*?```/g, (block) => `<pre class="pre">${block.replace(/```/g, "")}</pre>`)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`)
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_all, alt, src) => {
      return `<figure class="post-figure"><img src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" /><figcaption>${alt}</figcaption></figure>`;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n+/g, "</p><p>");
  return `<p>${blocks}</p>`;
}

/* ── Rich text editor: Markdown ↔ HTML round-trip ────────────── */

function markdownToEditorHtml(md) {
  if (!md) return "";
  // Process code blocks first (protect from further transformation)
  const codeBlocks = [];
  let safe = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const i = codeBlocks.length;
    codeBlocks.push(`<pre class="pre"><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return `\n%%CODEBLOCK_${i}%%\n`;
  });
  // Inline code
  safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Images
  safe = safe.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    (_m, alt, src) => `<figure class="post-figure"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" /><figcaption>${escapeHtml(alt)}</figcaption></figure>`);
  // Links
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  // Bold / Italic
  safe = safe.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/(?<![*\w])\*([^*]+)\*(?![*\w])/g, "<em>$1</em>");
  // Horizontal rule
  safe = safe.replace(/^---+$/gm, "<hr>");
  // Headings
  safe = safe.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  safe = safe.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  safe = safe.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Ordered lists
  safe = safe.replace(/^\d+\.\s+(.+)$/gm, "<oli>$1</oli>");
  safe = safe.replace(/(<oli>.*<\/oli>\n?)+/g, (list) =>
    `<ol>${list.replace(/<\/?oli>/g, (t) => t.replace("oli", "li"))}</ol>`);
  // Unordered lists
  safe = safe.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>");
  safe = safe.replace(/(<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`);
  // Paragraphs: split on blank lines
  const lines = safe.split(/\n\n+/);
  const html = lines.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (/^<(h[1-6]|ul|ol|pre|figure|hr|blockquote)/.test(trimmed)) return trimmed;
    if (/^%%CODEBLOCK_\d+%%$/.test(trimmed)) return trimmed;
    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
  // Restore code blocks
  return html.replace(/%%CODEBLOCK_(\d+)%%/g, (_m, i) => codeBlocks[Number(i)] || "");
}

function htmlToMarkdown(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    const children = () => Array.from(node.childNodes).map(walk).join("");

    switch (tag) {
      case "h1": return `\n# ${children().trim()}\n\n`;
      case "h2": return `\n## ${children().trim()}\n\n`;
      case "h3": return `\n### ${children().trim()}\n\n`;
      case "strong":
      case "b": return `**${children()}**`;
      case "em":
      case "i": return `*${children()}*`;
      case "a": {
        const href = node.getAttribute("href") || "";
        const text = children().trim();
        return href ? `[${text}](${href})` : text;
      }
      case "code": {
        if (node.parentElement?.tagName === "PRE") return children();
        return `\`${children()}\``;
      }
      case "pre": {
        const code = node.querySelector("code");
        const text = code ? code.textContent : node.textContent;
        return `\n\`\`\`\n${(text || "").trim()}\n\`\`\`\n\n`;
      }
      case "img": {
        const alt = node.getAttribute("alt") || "Image";
        const src = node.getAttribute("src") || "";
        return `![${alt}](${src})`;
      }
      case "figure": {
        const img = node.querySelector("img");
        if (img) {
          const alt = img.getAttribute("alt") || "Image";
          const src = img.getAttribute("src") || "";
          return `\n![${alt}](${src})\n\n`;
        }
        return children();
      }
      case "figcaption": return "";
      case "ul": {
        const items = Array.from(node.querySelectorAll(":scope > li"));
        return "\n" + items.map((li) => `- ${walk(li).trim()}`).join("\n") + "\n\n";
      }
      case "ol": {
        const items = Array.from(node.querySelectorAll(":scope > li"));
        return "\n" + items.map((li, i) => `${i + 1}. ${walk(li).trim()}`).join("\n") + "\n\n";
      }
      case "li": return children();
      case "p": return `${children().trim()}\n\n`;
      case "br": return "\n";
      case "hr": return "\n---\n\n";
      case "div": return `${children()}\n`;
      case "blockquote": {
        const inner = children().trim().split("\n").map((l) => `> ${l}`).join("\n");
        return `\n${inner}\n\n`;
      }
      default: return children();
    }
  }

  const result = Array.from(div.childNodes).map(walk).join("");
  // Clean up excessive newlines
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function getEditorContent(root) {
  const editor = root.querySelector("#draft-content-editor");
  if (editor) return htmlToMarkdown(editor.innerHTML);
  const textarea = root.querySelector("#draft-content");
  return textarea ? textarea.value : "";
}

function initRichEditor(root, run) {
  const editor = root.querySelector("#draft-content-editor");
  if (!editor) return;

  const toolbar = root.querySelector(".rich-toolbar");
  if (!toolbar) return;

  function execCmd(cmd, value) {
    editor.focus();
    document.execCommand(cmd, false, value || null);
    refreshQualityPreview(root, run);
  }

  function updateActiveStates() {
    toolbar.querySelectorAll("[data-cmd]").forEach((btn) => {
      const cmd = btn.dataset.cmd;
      if (cmd === "bold" || cmd === "italic" || cmd === "insertUnorderedList" || cmd === "insertOrderedList") {
        btn.classList.toggle("active", document.queryCommandState(cmd));
      }
    });
    // Check current block type for heading buttons
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node = sel.anchorNode;
      while (node && node !== editor) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName;
          toolbar.querySelectorAll("[data-block]").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.block.toUpperCase() === tag);
          });
          if (["H1", "H2", "H3", "H4"].includes(tag)) break;
        }
        node = node.parentNode;
      }
    }
  }

  toolbar.querySelectorAll("[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      execCmd(btn.dataset.cmd, btn.dataset.value);
      updateActiveStates();
    });
  });

  toolbar.querySelectorAll("[data-block]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      editor.focus();
      document.execCommand("formatBlock", false, `<${btn.dataset.block}>`);
      refreshQualityPreview(root, run);
      updateActiveStates();
    });
  });

  // Link insertion
  const linkBtn = toolbar.querySelector("[data-action=link]");
  if (linkBtn) {
    linkBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const url = prompt("Link URL:");
      if (url && /^https?:\/\//i.test(url)) {
        execCmd("createLink", url);
      }
    });
  }

  // Image insertion
  const imgBtn = toolbar.querySelector("[data-action=image]");
  if (imgBtn) {
    imgBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const url = prompt("Image URL:");
      if (!url || !/^https?:\/\//i.test(url)) return;
      const alt = prompt("Alt text:", "Image") || "Image";
      execCmd("insertHTML",
        `<figure class="post-figure"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" /><figcaption>${escapeHtml(alt)}</figcaption></figure>`);
      // Also set featured image if empty
      const featured = root.querySelector("#draft-featured");
      if (featured && !String(featured.value || "").trim()) featured.value = url;
    });
  }

  // Code block
  const codeBtn = toolbar.querySelector("[data-action=code]");
  if (codeBtn) {
    codeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const sel = window.getSelection();
      const text = sel?.toString() || "code here";
      execCmd("insertHTML", `<pre class="pre"><code>${escapeHtml(text)}</code></pre>`);
    });
  }

  // Horizontal rule
  const hrBtn = toolbar.querySelector("[data-action=hr]");
  if (hrBtn) {
    hrBtn.addEventListener("click", (e) => {
      e.preventDefault();
      execCmd("insertHorizontalRule");
    });
  }

  // Keyboard shortcuts
  editor.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      execCmd("bold");
    } else if ((e.ctrlKey || e.metaKey) && e.key === "i") {
      e.preventDefault();
      execCmd("italic");
    }
    updateActiveStates();
  });

  // Update preview on input
  editor.addEventListener("input", () => {
    refreshQualityPreview(root, run);
  });

  // Track active formatting states
  editor.addEventListener("keyup", updateActiveStates);
  editor.addEventListener("mouseup", updateActiveStates);
  editor.addEventListener("click", updateActiveStates);

  bindQuickEdit(editor, root, run);
}

/** Selection → Regenerate (Quick Edit) floating UI, Cursor/VS Code style. */
function bindQuickEdit(editor, root, run) {
  let host = document.getElementById("quick-edit-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "quick-edit-host";
    host.hidden = true;
    document.body.appendChild(host);
  }

  let savedRange = null;
  let selectedText = "";
  let open = false;
  let busy = false;

  function clearHost() {
    host.innerHTML = "";
    host.hidden = true;
    open = false;
  }

  function selectionInEditor() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!node || !editor.contains(node)) return null;
    const text = sel.toString().replace(/\u00a0/g, " ").trim();
    if (text.length < 2) return null;
    return { sel, text, range: sel.getRangeAt(0).cloneRange() };
  }

  function positionNearSelection(el, range) {
    const rect = range.getBoundingClientRect();
    const pad = 8;
    // Measure after paint so offsetHeight is accurate.
    el.style.visibility = "hidden";
    el.style.top = "0px";
    el.style.left = "0px";
    const h = el.offsetHeight || 40;
    const w = el.offsetWidth || 120;
    let top = rect.top - h - pad;
    if (top < pad) top = Math.min(window.innerHeight - h - pad, rect.bottom + pad);
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = "visible";
  }

  function showRegenChip() {
    if (busy || open) return;
    const hit = selectionInEditor();
    if (!hit) {
      clearHost();
      return;
    }
    savedRange = hit.range;
    selectedText = hit.text;
    host.hidden = false;
    host.innerHTML = `
      <div class="quick-edit-chip" role="toolbar">
        <button type="button" class="quick-edit-chip-btn" data-qe="open">Regenerate</button>
      </div>`;
    const chip = host.querySelector(".quick-edit-chip");
    positionNearSelection(chip, hit.range);
    chip.querySelector("[data-qe=open]")?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openQuickEdit();
    });
  }

  function openQuickEdit() {
    if (!selectedText || !savedRange) return;
    open = true;
    host.hidden = false;
    const preview =
      selectedText.length > 220 ? `${selectedText.slice(0, 220)}…` : selectedText;
    host.innerHTML = `
      <div class="quick-edit-panel" role="dialog" aria-label="Regenerate selection">
        <div class="quick-edit-panel-head">
          <strong>Regenerate selection</strong>
          <button type="button" class="quick-edit-close" data-qe="close" aria-label="Close">×</button>
        </div>
        <pre class="quick-edit-preview">${escapeHtml(preview)}</pre>
        <label class="quick-edit-label">
          <span class="sr-only">Instruction</span>
          <input type="text" class="quick-edit-input" placeholder="Edit selected text…" autocomplete="off" />
        </label>
        <div class="quick-edit-actions">
          <button type="button" class="btn" data-qe="close">Cancel</button>
          <button type="button" class="btn primary" data-qe="submit">Regenerate</button>
        </div>
        <p class="quick-edit-status" hidden></p>
      </div>`;
    const panel = host.querySelector(".quick-edit-panel");
    positionNearSelection(panel, savedRange);
    const input = host.querySelector(".quick-edit-input");
    input?.focus();

    host.querySelectorAll("[data-qe=close]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        clearHost();
      });
    });
    host.querySelector("[data-qe=submit]")?.addEventListener("click", (e) => {
      e.preventDefault();
      submitQuickEdit();
    });
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitQuickEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearHost();
      }
    });
  }

  async function submitQuickEdit() {
    if (busy) return;
    const input = host.querySelector(".quick-edit-input");
    const status = host.querySelector(".quick-edit-status");
    const instruction = String(input?.value || "").trim();
    if (instruction.length < 2) {
      toast("Add a short instruction for the rewrite", true);
      input?.focus();
      return;
    }
    if (!state.selectedId || !selectedText) return;

    busy = true;
    const submitBtn = host.querySelector("[data-qe=submit]");
    if (submitBtn) submitBtn.disabled = true;
    const started = Date.now();
    let tick = null;
    if (status) {
      status.hidden = false;
      status.textContent = "Rewriting selection…";
      tick = setInterval(() => {
        status.textContent = `Rewriting selection… ${Math.round((Date.now() - started) / 1000)}s`;
      }, 400);
    }

    try {
      const content = getEditorContent(root) || run.article?.content || "";
      const result = await api(`/api/runs/${encodeURIComponent(state.selectedId)}/regenerate-selection`, {
        method: "POST",
        body: JSON.stringify({
          selectedText,
          instruction,
          content,
        }),
      });
      state.run = result;
      // Update editor in place — avoid full tab remount latency.
      const editor = root.querySelector("#draft-content-editor");
      if (editor && result.article?.content) {
        editor.innerHTML = markdownToEditorHtml(result.article.content);
        refreshQualityPreview(root, result);
      }
      clearHost();
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      toast(`Selection regenerated (${secs}s)`);
      void loadRuns().catch(() => {});
    } catch (e) {
      if (status) status.textContent = e.message || "Regenerate failed";
      toast(e.message || "Regenerate failed", true);
      if (submitBtn) submitBtn.disabled = false;
    } finally {
      if (tick) clearInterval(tick);
      busy = false;
    }
  }

  editor.addEventListener("mouseup", () => {
    requestAnimationFrame(showRegenChip);
  });
  editor.addEventListener("keyup", (e) => {
    if (e.key === "Escape") clearHost();
    else if (e.shiftKey || e.key.startsWith("Arrow")) requestAnimationFrame(showRegenChip);
  });

  document.addEventListener("mousedown", (e) => {
    if (!host.contains(e.target) && e.target !== editor && !editor.contains(e.target)) {
      if (!open) clearHost();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !host.hidden) clearHost();
  });
}

function renderPublishPreview(run) {
  const a = run.article;
  if (!a) {
    return `<p class="empty">No draft yet. Assign a template, then Run to review or Generate.</p>`;
  }
  const targets = selectedTargets(run);
  const destLabels = targets
    .map((id) => PUBLISH_SITES.find((s) => s.id === id)?.label || id)
    .join(", ");
  const canPublish = ["APPROVED", "PUBLISH_FAILED"].includes(run.status);
  const results = Array.isArray(run.publishResults) && run.publishResults.length
    ? run.publishResults
    : run.publishResult
      ? [run.publishResult]
      : [];
  return `
    <p class="hint">
      Approved draft for <strong>${escapeHtml(destLabels || "no sites selected")}</strong>.
      Spanwrap publishes now. Medium and Substack are planned connectors.
    </p>
    ${renderPostArticle(run, a)}
    ${
      results.length
        ? `<ul class="issues" style="margin-top:1rem">${results
            .map((r) => {
              const label = r.target
                ? PUBLISH_SITES.find((s) => s.id === r.target)?.label || r.target
                : "Publish";
              const ok = r.success ? "Published" : r.statusCode === 501 ? "Planned" : "Failed";
              let extra = r.externalId ? ` · id ${escapeHtml(r.externalId)}` : "";
              if (r.raw && r.raw.html) {
                const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(r.raw.html);
                extra += ` <a href="${dataUri}" download="${escapeHtml(r.raw.filename || "draft.html")}" class="btn" style="margin-left: 0.5rem; text-decoration: none; display: inline-block;">Download HTML</a>`;
              }
              return `<li style="margin-bottom: 0.5rem;"><strong>${escapeHtml(label)}</strong> · ${ok} — ${escapeHtml(r.message || "")}${extra}</li>`;
            })
            .join("")}</ul>`
        : ""
    }
    <div class="form-actions" style="margin-top:1rem">
      <button type="button" class="btn primary" id="confirm-publish" ${canPublish ? "" : "disabled"}>
        Publish to selected sites
      </button>
    </div>
    ${
      canPublish
        ? ""
        : `<p class="hint">Approve this draft in the Quality tab first (current status: ${escapeHtml(run.status)}).</p>`
    }
  `;
}

function renderQualityTab(run) {
  const a = run.article;
  if (!a) {
    return `<p class="empty">No draft yet. Assign a template above, then Run to review or Generate.</p>`;
  }
  const targets = selectedTargets(run);
  const dest = PUBLISH_SITES.map(
    (site) => `
      <label class="check">
        <input type="checkbox" name="publish-target" value="${site.id}" ${
          targets.includes(site.id) ? "checked" : ""
        } />
        <span><strong>${escapeHtml(site.label)}</strong> · ${escapeHtml(site.note)}</span>
      </label>`,
  ).join("");
  const q = run.quality;
  return `
    ${
      q
        ? `<div class="quality-score">
            Score <strong>${q.score}</strong> · ${q.passed ? "pass" : "flag"}
            <ul class="issues">
              ${(q.issues || [])
                .map(
                  (i) =>
                    `<li><strong>${escapeHtml(i.severity)}</strong> ${escapeHtml(i.type)} — ${escapeHtml(i.message)}</li>`,
                )
                .join("")}
            </ul>
          </div>`
        : ""
    }
    <p class="hint">Tip: select any passage in the editor to open <strong>Regenerate</strong> (Quick Edit).</p>
    <div class="quality-single-layout">
      <div class="quality-editor doc-style-editor">
        <input id="draft-title" class="doc-title-input" placeholder="Document Title" value="${escapeHtml(a.title || "")}" />
        <textarea id="draft-excerpt" class="doc-excerpt-input" placeholder="Subtitle / Excerpt">${escapeHtml(a.excerpt || "")}</textarea>
        
        <div class="rich-editor">
          <div class="rich-toolbar">
            <button type="button" data-cmd="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
            <button type="button" data-cmd="italic" title="Italic (Ctrl+I)"><em>I</em></button>
            <span class="toolbar-sep"></span>
            <button type="button" data-block="h2" title="Heading 2">H2</button>
            <button type="button" data-block="h3" title="Heading 3">H3</button>
            <button type="button" data-block="p" title="Paragraph">¶</button>
            <span class="toolbar-sep"></span>
            <button type="button" data-cmd="insertUnorderedList" title="Bullet list">• List</button>
            <button type="button" data-cmd="insertOrderedList" title="Numbered list">1. List</button>
            <span class="toolbar-sep"></span>
            <button type="button" data-action="link" title="Insert link">🔗</button>
            <button type="button" data-action="image" title="Insert image">🖼️</button>
            <button type="button" data-action="code" title="Code block">&lt;/&gt;</button>
            <button type="button" data-action="hr" title="Horizontal rule">─</button>
          </div>
          <div id="draft-content-editor" class="rich-editor-content" contenteditable="true">${markdownToEditorHtml(a.content || "")}</div>
        </div>

        <div class="doc-meta-panel" style="margin-top: 1rem;">
          <label>Featured image URL (optional)
            <input id="draft-featured" placeholder="https://" value="${escapeHtml(a.featuredImage || "")}" />
          </label>
          <fieldset class="destinations" style="margin-top: 1rem;">
            <legend>Publish to</legend>
            ${dest}
          </fieldset>
        </div>
        
        <div class="form-actions" style="margin-top: 1.5rem;">
          <button type="button" class="btn" id="save-review">Save draft</button>
          <button type="button" class="btn danger" id="reject-review">Reject</button>
          <button type="button" class="btn primary" id="approve-review">Approve</button>
        </div>
      </div>
    </div>`;
}

function renderTab(run, tab) {
  if (tab === "article") {
    const a = run.article;
    if (!a) return `<p class="empty">No article yet. Run generate or Write blog from Runs.</p>`;
    const sections = (a.content.match(/^##\s+(.+)$/gm) || []).map((h) => h.replace(/^##\s+/, ""));
    return `
      ${
        run.thumbnailVariants?.length
          ? `<div class="thumb-ab"><p class="hint">Thumbnail A/B</p>${run.thumbnailVariants
              .map(
                (v) =>
                  `<label class="thumb-choice ${v.selected ? "selected" : ""}"><input type="radio" name="thumb" value="${escapeHtml(v.id)}" ${v.selected ? "checked" : ""}/> ${escapeHtml(v.label)}<br/><img src="${escapeHtml(v.url)}" alt=""/></label>`,
              )
              .join("")}</div>`
          : ""
      }
      ${
        sections.length
          ? `<div class="section-regen"><p class="hint">Section regenerate</p>${sections
              .map(
                (h) =>
                  `<button type="button" class="btn" data-regen-section="${escapeHtml(h)}">↻ ${escapeHtml(h)}</button>`,
              )
              .join(" ")}</div>`
          : ""
      }
      ${renderPostArticle(run, a)}
      <details style="margin-top:1rem">
        <summary>Edit article JSON</summary>
        <textarea id="article-json">${escapeHtml(JSON.stringify(a, null, 2))}</textarea>
        <div class="form-actions" style="margin-top:0.6rem">
          <button type="button" class="btn" id="save-article">Save article</button>
        </div>
      </details>`;
  }
  if (tab === "seo") {
    const pack = run.seoPack;
    if (!pack) return `<p class="empty">No SEO pack yet — accept a draft or run quality.</p>`;
    return `<div class="seo-pack">
      <p class="hint">Primary keyword: <strong>${escapeHtml(pack.primaryKeyword || "")}</strong></p>
      <h4>Title variants</h4>
      ${(pack.titles || []).map((t) => `<button type="button" class="btn" data-seo-title="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join(" ")}
      <h4>Meta descriptions</h4>
      ${(pack.descriptions || []).map((t) => `<button type="button" class="btn" data-seo-desc="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join(" ")}
      <h4>Slug suggestions</h4>
      ${(pack.slugSuggestions || []).map((t) => `<button type="button" class="btn" data-seo-slug="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join(" ")}
      <h4>Long-tail</h4>
      <p>${(pack.longTailKeywords || []).map((k) => escapeHtml(k)).join(" · ")}</p>
    </div>`;
  }
  if (tab === "facts") {
    const cards = run.factCards || [];
    const brief = run.competitorBrief;
    const hasAnalysis = Boolean(run.analysis);
    const hasSources = Boolean(run.sources?.length);
    if (!hasSources && !hasAnalysis) {
      return `<p class="empty">No research yet. Click <strong>Run to review</strong> or <strong>Research</strong> first.</p>`;
    }
    if (!cards.length && !brief) {
      return `<p class="empty">Research finished, but no claims/arguments were extracted yet. Re-run <strong>Research</strong> or continue to outline.</p>
        <p class="hint">Sources on this run: ${run.sources?.length || 0}. Analysis: ${hasAnalysis ? "yes" : "no"}.</p>`;
    }
    return `
      ${brief ? `<div class="competitor-brief"><h3>Competitor angle brief</h3><p>${escapeHtml(brief.summary)}</p>
        <h4>Angles to own</h4><ul>${(brief.anglesToOwn || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
        <h4>Angles to avoid</h4><ul>${(brief.anglesToAvoid || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
        <h4>Competing viewpoints</h4><ul>${(brief.competingViewpoints || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
      </div>` : ""}
      <h3>Fact cards ${cards.length ? `(${cards.length})` : ""}</h3>
      ${
        cards.length
          ? cards
              .map(
                (c) => `<article class="fact-card ${c.grounded ? "ok" : "warn"}">
          <strong>${escapeHtml(c.claim)}</strong>
          <div class="meta">${escapeHtml(c.category)} · confidence ${Math.round((c.confidence || 0) * 100)}% · ${c.grounded ? "grounded" : "needs source"}</div>
          <ul>${(c.sources || []).map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.title)}</a></li>`).join("")}</ul>
        </article>`,
              )
              .join("")
          : `<p class="hint">No structured claims yet — competitor brief above still applies.</p>`
      }`;
  }
  if (tab === "diff") {
    if (!run.article) {
      return `<p class="empty">No draft yet — Diff compares article versions after generate / edit / readability / Quick Edit.</p>`;
    }
    if (!run.previousArticle) {
      return `<p class="empty">No previous version yet. Diff appears after you change the draft (Save, Readability pass, section regenerate, or Quick Edit).</p>`;
    }
    return `<div class="diff-panel">
      <p class="hint">Comparing <strong>${escapeHtml(run.previousArticle.title || "previous")}</strong> → <strong>${escapeHtml(run.article.title || "current")}</strong></p>
      <div id="diff-mount" class="diff-mount"><p class="hint">Loading diff…</p></div>
    </div>`;
  }
  if (tab === "repurpose") {
    const p = run.repurposePack;
    if (!p) return `<p class="empty">No repurpose pack yet — run quality or distribute.</p>`;
    return `<div class="repurpose-pack">
      <h4>X / Twitter</h4><pre class="pre">${escapeHtml(p.tweet)}</pre>
      <h4>LinkedIn</h4><pre class="pre">${escapeHtml(p.linkedInPost)}</pre>
      <h4>Newsletter</h4><pre class="pre">${escapeHtml(p.newsletterBlurb)}</pre>
      <h4>Thread</h4><pre class="pre">${escapeHtml((p.thread || []).join("\n\n"))}</pre>
      <h4>YouTube short outline</h4><ul>${(p.youtubeShortOutline || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      <h4>Reddit</h4><pre class="pre">${escapeHtml(p.redditTitle + "\n\n" + p.redditBody)}</pre>
    </div>`;
  }
  if (tab === "publish") {
    return renderPublishPreview(run);
  }
  if (tab === "outline") {
    if (!run.outline) return `<p class="empty">No outline yet.</p>`;
    return `
      <textarea id="outline-json">${escapeHtml(JSON.stringify(run.outline, null, 2))}</textarea>
      <div class="form-actions" style="margin-top:0.6rem">
        <button type="button" class="btn" id="save-outline">Save outline</button>
      </div>`;
  }
  if (tab === "template") {
    return `
      <p class="hint">
        This snapshot is sent to the LLM as section guidelines and instructions with the topic and sources.
        Re-assign from the header above to change it (that clears outline and draft so they can regenerate).
      </p>
      ${
        run.templateMarkdown
          ? `<pre class="pre">${escapeHtml(run.templateMarkdown)}</pre>`
          : `<p class="empty">No template on this run. Use Assign template in the header.</p>`
      }`;
  }
  if (tab === "sources") {
    if (!run.sources?.length) return `<p class="empty">No sources yet.</p>`;
    return run.sources
      .map(
        (s) => `
      <article style="margin-bottom:1rem">
        <strong>${escapeHtml(s.title)}</strong>
        <div style="color:var(--muted);font-size:0.85rem">${escapeHtml(s.url)} · score ${s.relevanceScore}</div>
        <pre class="pre" style="max-height:180px">${escapeHtml((s.content || "").slice(0, 1200))}</pre>
      </article>`,
      )
      .join("");
  }
  if (tab === "analysis") {
    if (!run.analysis) return `<p class="empty">No analysis yet.</p>`;
    return `<pre class="pre">${escapeHtml(JSON.stringify(run.analysis, null, 2))}</pre>`;
  }
  if (tab === "quality") {
    return renderQualityTab(run);
  }
  if (tab === "stages") {
    return `<pre class="pre">${escapeHtml(JSON.stringify(run.stages || [], null, 2))}</pre>`;
  }
  return `<pre class="pre">${escapeHtml(JSON.stringify(run, null, 2))}</pre>`;
}

$("#create-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  createRun(false);
});
$("#create-and-run")?.addEventListener("click", () => createRun(true));
$("#batch-run")?.addEventListener("click", async () => {
  if (state.busy) return;
  const raw = String($("#batch-topics")?.value || "");
  const topics = raw
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 8);
  if (!topics.length) {
    toast("Add at least one topic (one per line)", true);
    return;
  }
  setBusy(true);
  try {
    const data = await api("/api/runs/batch", {
      method: "POST",
      body: JSON.stringify({
        topics,
        templateId: $("#template-select")?.value || null,
        stylePresetId: $("#style-preset-select")?.value || null,
        generateImages: wantsImages(),
      }),
    });
    toast(`Batch created ${data.runs?.length || 0} runs through outline`);
    await loadRuns();
    if (data.runs?.[0]?.id) await selectRun(data.runs[0].id);
  } catch (e) {
    toast(e.message, true);
  } finally {
    setBusy(false);
  }
});
async function writeBlogFromRun() {
  if (!state.selectedId) {
    toast("Select a run in the list first", true);
    return;
  }
  const templateId = $("#runs-template")?.value || null;
  setBusy(true);
  try {
    let run = state.run;
    if (!run || run.id !== state.selectedId) {
      run = await api(`/api/runs/${encodeURIComponent(state.selectedId)}`);
      state.run = run;
    }
    const locked = ["PUBLISHED", "APPROVED"].includes(run.status);
    if (locked) {
      const created = await api("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          topic: run.brief.topic,
          targetAudience: run.brief.targetAudience,
          tone: run.brief.tone,
          keywords: run.brief.keywords || [],
          referenceUrls: run.brief.referenceUrls || [],
          templateId,
        }),
      });
      state.selectedId = created.id;
      state.run = await api(`/api/runs/${encodeURIComponent(created.id)}/run`, {
        method: "POST",
        body: "{}",
      });
      toastRunResult(state.run, `Wrote new draft ${state.run.id}`);
    } else {
      if (templateId !== (run.templateId || null)) {
        await api(`/api/runs/${encodeURIComponent(run.id)}/assign-template`, {
          method: "POST",
          body: JSON.stringify({ templateId }),
        });
      }
      state.run = await api(`/api/runs/${encodeURIComponent(run.id)}/run`, {
        method: "POST",
        body: "{}",
      });
      toastRunResult(state.run, "Write blog finished");
    }
    if (state.run?.article) state.tab = "quality";
    await loadRuns();
    renderList();
    renderDetail();
    document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    toast(e.message, true);
    await loadRuns().catch(() => {});
    if (state.selectedId) {
      try {
        state.run = await api(`/api/runs/${encodeURIComponent(state.selectedId)}`);
        renderDetail();
      } catch {
        /* keep current */
      }
    }
  } finally {
    setBusy(false);
  }
}

$("#refresh").addEventListener("click", () => loadRuns().catch((e) => toast(e.message, true)));
$("#runs-write")?.addEventListener("click", () => writeBlogFromRun());

function updateTemplateSizeHint(markdown) {
  const el = $("#template-size-hint");
  if (!el) return;
  const chars = String(markdown || "").length;
  const tokens = Math.ceil(chars / 4);
  el.textContent = `Rough size: ${chars.toLocaleString()} characters (~${tokens.toLocaleString()} tokens). Aim under ~1,500 tokens so topic + research still fit.`;
  el.classList.toggle("hint-warn", tokens > 1500);
}

$("#template-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const name = String(fd.get("name") || "").trim();
  let markdown = String(fd.get("markdown") || "").trim();
  let filename = "";
  const file = fd.get("file");
  try {
    if (file && file.size) {
      markdown = await file.text();
      filename = file.name;
    }
    if (!markdown) throw new Error("Provide a .md file or paste markdown");
    const tokens = Math.ceil(markdown.length / 4);
    await api("/api/templates", {
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
    form.reset();
    updateTemplateSizeHint("");
    await loadTemplates();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#llm-provider")?.addEventListener("change", () => {
  const provider = $("#llm-provider").value;
  const providers = llmProviderList(llmCatalog);
  const info = providers.find((p) => p.id === provider);
  fillLlmForm({
    ...(llmCatalog || {}),
    providers,
    provider,
    model: info?.defaultModel || "",
    hasKey: llmCatalog && provider === llmCatalog.provider ? llmCatalog.hasKey : false,
    keyPreview: llmCatalog && provider === llmCatalog.provider ? llmCatalog.keyPreview : null,
    remappedFrom: null,
  });
});

$("#llm-model-select")?.addEventListener("change", () => {
  const wrap = $("#llm-model-custom-wrap");
  if (wrap) wrap.hidden = $("#llm-model-select").value !== "__custom__";
});

$("#save-llm")?.addEventListener("click", async () => {
  setBusy(true);
  try {
    const provider = $("#llm-provider")?.value;
    const model = selectedLlmModel();
    const apiKey = String($("#llm-api-key")?.value || "").trim();
    const saved = await api("/api/llm", {
      method: "POST",
      body: JSON.stringify({ provider, model, apiKey: apiKey || undefined }),
    });
    fillLlmForm(saved);
    toast(`LLM set to ${saved.provider} · ${saved.model}`);
    await loadHealth();
  } catch (e) {
    toast(e.message, true);
  } finally {
    setBusy(false);
  }
});

$("#load-digest")?.addEventListener("click", async () => {
  setBusy(true);
  try {
    await loadDigest({ refresh: true });
    const d = state.digest;
    toast(
      `Digest: ${d.github?.length ?? 0} GitHub · ${d.reddit?.length ?? 0} Reddit · ${d.x?.length ?? 0} X`,
    );
  } catch (e) {
    toast(e.message, true);
  } finally {
    setBusy(false);
  }
});

$("#discover-topics")?.addEventListener("click", async () => {
  setBusy(true);
  try {
    toast("Discovering hot topics…");
    const result = await api("/api/topics/discover", {
      method: "POST",
      body: "{}",
    });
    state.topics = result.topics || [];
    renderTopics();
    toast(`Found ${result.count ?? state.topics.length} topic ideas`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    setBusy(false);
  }
});

$("#llm-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  $("#save-llm")?.click();
});

async function loadLogs() {
  const list = $("#activity-list");
  if (!list) return;
  try {
    const data = await api("/api/logs?limit=80");
    const entries = data.entries || [];
    if (!entries.length) {
      list.innerHTML = `<li class="empty">No activity yet.</li>`;
      return;
    }
    list.innerHTML = entries
      .map((entry) => {
        const extra = [
          entry.details?.topic,
          entry.details?.runId,
          entry.details?.name,
          entry.details?.createdUsername,
        ]
          .filter(Boolean)
          .map((v) => escapeHtml(String(v)))
          .join(" · ");
        return `<li>
        <strong>${escapeHtml(activityLabel(entry.action))}</strong>
        <div class="meta">${escapeHtml(entry.username || "—")} · ${escapeHtml(formatWhen(entry.at))}${
          extra ? ` · ${extra}` : ""
        }</div>
      </li>`;
      })
      .join("");
  } catch (e) {
    list.innerHTML = `<li class="empty">${escapeHtml(e.message)}</li>`;
  }
}

async function loadUsers() {
  const list = $("#user-list");
  if (!list) return;
  try {
    const data = await api("/api/auth/users");
    const users = data.users || [];
    if (!users.length) {
      list.innerHTML = `<li class="empty">No people yet.</li>`;
      return;
    }
    list.innerHTML = users
      .map(
        (u) => `<li>
        <strong>${escapeHtml(u.username)}</strong>
        <div class="meta">added ${escapeHtml(formatWhen(u.createdAt))}${
          u.lastLoginAt ? ` · last sign-in ${escapeHtml(formatWhen(u.lastLoginAt))}` : ""
        }</div>
      </li>`,
      )
      .join("");
  } catch (e) {
    list.innerHTML = `<li class="empty">${escapeHtml(e.message)}</li>`;
  }
}

$("#auth-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#auth-error");
  const username = String($("#auth-username")?.value || "").trim();
  const password = String($("#auth-password")?.value || "");
  try {
    const path = setupMode ? "/api/auth/setup" : "/api/auth/login";
    const data = await api(path, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    showAppShell(data.username);
    applyPage();
    loadHealth();
    const boot = [loadLlm(), loadTemplates()];
    if (isSettingsPage()) boot.push(loadLogs(), loadUsers());
    else boot.push(loadRuns(), loadDigest());
    await Promise.all(boot);
  } catch (ex) {
    if (err) {
      err.hidden = false;
      err.textContent = ex.message;
    } else {
      toast(ex.message, true);
    }
  }
});

$("#logout-btn")?.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    /* still lock the UI */
  }
  showAuthGate(false);
});

$("#refresh-logs")?.addEventListener("click", () => {
  loadLogs().catch((e) => toast(e.message, true));
});

$("#add-user-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  try {
    await api("/api/auth/users", {
      method: "POST",
      body: JSON.stringify({
        username: String(fd.get("username") || ""),
        password: String(fd.get("password") || ""),
      }),
    });
    form.reset();
    toast("Person added");
    await loadUsers();
    await loadLogs();
  } catch (ex) {
    toast(ex.message, true);
  }
});

applyPage();
fillLlmForm({
  provider: "groq",
  model: "openai/gpt-oss-20b",
  providers: LLM_PROVIDERS,
  hasKey: false,
});
updateTemplateSizeHint("");
$("#template-markdown")?.addEventListener("input", (e) => updateTemplateSizeHint(e.target.value));
$("#template-form")?.querySelector('input[type="file"]')?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    updateTemplateSizeHint(await file.text());
  } catch {
    /* ignore */
  }
});

// ── Autopilot UI ──

async function loadAutopilotStatus() {
  try {
    const res = await fetch("/api/autopilot/status");
    if (!res.ok) return;
    const data = await res.json();
    renderAutopilotStatus(data);
  } catch {
    /* ignore */
  }
}

async function loadAutopilotHistory() {
  try {
    const res = await fetch("/api/autopilot/history?limit=10");
    if (!res.ok) return;
    const data = await res.json();
    renderAutopilotHistory(data.cycles || []);
  } catch {
    /* ignore */
  }
}

function renderAutopilotStatus(data) {
  const el = (id) => document.getElementById(id);

  // Status badge
  const enabledEl = el("ap-enabled");
  if (enabledEl) {
    const isOn = data.enabled;
    enabledEl.innerHTML = `<span class="ap-badge ${isOn ? 'enabled' : 'disabled'}">${isOn ? 'Enabled' : 'Disabled'}</span>`;
    if (data.cycleBusy) {
      enabledEl.innerHTML += ` <span class="ap-badge running">Cycle running…</span>`;
    }
  }

  // Next run
  const nextEl = el("ap-next");
  if (nextEl) {
    nextEl.textContent = data.nextRun
      ? new Date(data.nextRun).toLocaleString()
      : data.enabled ? "Computing…" : "Not scheduled";
  }

  // Config fields
  const cfg = data.config || {};
  const setEl = (id, val) => { const e = el(id); if (e) e.textContent = val; };
  setEl("ap-platforms", (cfg.platforms || []).join(", ") || "—");
  setEl("ap-posts", String(cfg.postsPerPlatform ?? "—"));
  setEl("ap-skip-review", cfg.skipReview ? "Yes" : "No");
  setEl("ap-min-quality", String(cfg.minQualityScore ?? "—"));
  setEl("ap-dedup", `${cfg.deduplicationDays ?? 30} days`);
  setEl("ap-dry-run", cfg.dryRun ? "Yes (no publish)" : "No");

  // Toggle button state
  const toggleBtn = el("autopilot-toggle");
  if (toggleBtn) {
    if (data.enabled) {
      toggleBtn.textContent = "Disable";
      toggleBtn.classList.add("ap-toggle-on");
    } else {
      toggleBtn.textContent = "Enable";
      toggleBtn.classList.remove("ap-toggle-on");
    }
  }
}

function renderAutopilotHistory(cycles) {
  const tbody = document.getElementById("autopilot-history-body");
  if (!tbody) return;

  if (!cycles.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No cycles recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = cycles.map((c) => {
    const started = new Date(c.startedAt).toLocaleString();
    const statusClass = c.status === "completed" ? "completed" : c.status === "failed" ? "failed" : "running";
    return `<tr>
      <td title="${c.id}">${c.id.slice(0, 12)}…</td>
      <td><span class="ap-badge ${statusClass}">${c.status}</span></td>
      <td>${c.topicsSelected}</td>
      <td>${c.runsCreated ? c.runsCreated.length : 0}</td>
      <td>${c.runsPublished}</td>
      <td>${c.runsNeedingReview}</td>
      <td>${c.errors ? c.errors.length : 0}</td>
      <td>${started}</td>
    </tr>`;
  }).join("");
}

// Toggle autopilot
document.getElementById("autopilot-toggle")?.addEventListener("click", async () => {
  const toggleBtn = document.getElementById("autopilot-toggle");
  const isEnabled = toggleBtn?.classList.contains("ap-toggle-on");
  try {
    const res = await fetch("/api/autopilot/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !isEnabled }),
    });
    if (!res.ok) throw new Error("Toggle failed");
    const data = await res.json();
    renderAutopilotStatus(data);
    toast(data.enabled ? "Autopilot enabled" : "Autopilot disabled");
  } catch (e) {
    toast(e.message, true);
  }
});

// Trigger autopilot now
document.getElementById("autopilot-trigger")?.addEventListener("click", async () => {
  const btn = document.getElementById("autopilot-trigger");
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = "Running…";
  btn.disabled = true;
  try {
    const res = await fetch("/api/autopilot/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Trigger failed");
    toast(`Autopilot cycle complete: ${data.runsCreated?.length ?? 0} runs created, ${data.runsPublished ?? 0} published`);
    await loadAutopilotStatus();
    await loadAutopilotHistory();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.textContent = prev;
    btn.disabled = false;
  }
});

async function bootApp() {
  const ok = await ensureAuth();
  if (!ok) return;
  try {
    state.generateImages = localStorage.getItem("pipeline.generateImages") === "1";
  } catch {
    /* ignore */
  }
  await loadHealth();
  const boot = [loadLlm(), loadTemplates()];
  if (isSettingsPage()) boot.push(loadLogs(), loadUsers(), loadAutopilotStatus(), loadAutopilotHistory());
  else boot.push(loadRuns(), loadDigest());
  await Promise.all(boot);
}

bootApp().catch((e) => toast(e.message, true));
