const state = {
  runs: [],
  templates: [],
  topics: [],
  selectedId: null,
  run: null,
  tab: "article",
  busy: false,
};

const $ = (sel) => document.querySelector(sel);

function toast(message, isError = false) {
  const el = $("#toast");
  el.hidden = false;
  el.textContent = message;
  el.style.background = isError ? "#8f2d2d" : "#1c1915";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 4000);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

function statusClass(status) {
  if (["PUBLISHED", "APPROVED"].includes(status)) return "ok";
  if (["FAILED", "PUBLISH_FAILED", "CANCELLED"].includes(status)) return "bad";
  if (["REVIEW_REQUIRED", "QUALITY_CHECK", "DRAFT_READY"].includes(status)) return "warn";
  return "";
}

async function loadHealth() {
  try {
    const h = await api("/api/health");
    $("#health").innerHTML = [
      `storage: <strong>${h.storage}</strong>`,
      `llm: <strong>${h.llmProvider}</strong>${h.hasLlmKey ? ` · ${h.llmModel || ""}` : " (no key → mock)"}`,
      `research: <strong>${h.researchProvider}</strong>`,
      `publish key: <strong>${h.hasSpanwrapKey ? "set" : "missing"}</strong>`,
    ].join("<br>");
  } catch (e) {
    $("#health").textContent = e.message;
  }
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
  const select = $("#template-select");
  const current = select.value;
  select.innerHTML =
    `<option value="">None (default structure)</option>` +
    state.templates
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
      .join("");
  if (current && state.templates.some((t) => t.id === current)) {
    select.value = current;
  }
  const list = $("#template-list");
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
        <div class="meta">${escapeHtml(t.id)} · ${escapeHtml(t.filename || "pasted")}</div>
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
  if (!state.runs.length) {
    list.innerHTML = `<li class="empty">No runs yet.</li>`;
    return;
  }
  list.innerHTML = state.runs
    .map(
      (r) => `
      <li>
        <button type="button" data-id="${r.id}" class="${r.id === state.selectedId ? "active" : ""}">
          <span class="topic">${escapeHtml(r.topic)}</span>
          <span class="meta">
            <span class="status ${statusClass(r.status)}">${r.status}</span>
            <span>${r.id}</span>
          </span>
        </button>
      </li>`,
    )
    .join("");
  list.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectRun(btn.dataset.id));
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
  document.querySelectorAll(".actions .btn, .form-actions .btn").forEach((b) => {
    b.disabled = busy;
  });
}

async function act(action, body) {
  if (!state.selectedId) return;
  setBusy(true);
  try {
    state.run = await api(`/api/runs/${encodeURIComponent(state.selectedId)}/${action}`, {
      method: "POST",
      body: body ? JSON.stringify(body) : "{}",
    });
    toast(`${action} complete → ${state.run.status}`);
    await loadRuns();
    renderDetail();
  } catch (e) {
    toast(e.message, true);
  } finally {
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
  };
}

async function createRun(andRun) {
  const form = $("#create-form");
  const brief = formBrief(form);
  if (!brief.topic) {
    toast("Topic is required", true);
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
    if (andRun) {
      state.run = await api(`/api/runs/${encodeURIComponent(run.id)}/run`, {
        method: "POST",
        body: "{}",
      });
      toast(`Run finished → ${state.run.status}`);
      await loadRuns();
    } else {
      state.run = run;
    }
    renderList();
    renderDetail();
  } catch (e) {
    toast(e.message, true);
  } finally {
    setBusy(false);
  }
}

function renderDetail() {
  const root = $("#detail");
  const run = state.run;
  if (!run) {
    root.innerHTML = `<p class="empty">Select a run to inspect sources, outline, article, and actions.</p>`;
    return;
  }

    const tabs = ["article", "outline", "template", "sources", "analysis", "quality", "stages", "raw"];
  const content = renderTab(run, state.tab);

  root.innerHTML = `
    <div class="detail-head">
      <div>
        <p class="brand">${escapeHtml(run.id)}</p>
        <h2>${escapeHtml(run.brief.topic)}</h2>
        <p class="meta-line">
          <span class="status ${statusClass(run.status)}">${run.status}</span>
          ${run.templateName ? ` · template: ${escapeHtml(run.templateName)}` : " · no template"}
          ${run.quality ? ` · quality ${run.quality.score} (${run.quality.passed ? "pass" : "flag"})` : ""}
          ${run.error ? ` · <span style="color:var(--danger)">${escapeHtml(run.error)}</span>` : ""}
        </p>
      </div>
    </div>
    <div class="actions">
      <button class="btn primary" data-act="run">Run to review</button>
      <button class="btn" data-act="research">Research</button>
      <button class="btn" data-act="outline">Outline</button>
      <button class="btn" data-act="generate">Generate</button>
      <button class="btn" data-act="quality-check">Quality</button>
      <button class="btn" data-act="approve">Approve</button>
      <button class="btn" data-act="reject">Reject</button>
      <button class="btn" data-act="publish">Publish</button>
    </div>
    <div class="tabs">
      ${tabs
        .map(
          (t) =>
            `<button type="button" data-tab="${t}" class="${state.tab === t ? "active" : ""}">${t}</button>`,
        )
        .join("")}
    </div>
    <div class="section">${content}</div>
  `;

  root.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.act;
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
      const templateId = root.querySelector("#run-template").value || null;
      await act("assign-template", { templateId });
    });
  }
}

function renderTab(run, tab) {
  if (tab === "article") {
    const a = run.article;
    if (!a) return `<p class="empty">No article yet. Run generate or full pipeline.</p>`;
    return `
      <h3>${escapeHtml(a.title)}</h3>
      <p style="color:var(--muted)">${escapeHtml(a.excerpt || "")}</p>
      <pre class="pre">${escapeHtml(a.content)}</pre>
      <details style="margin-top:1rem">
        <summary>Edit article JSON</summary>
        <textarea id="article-json">${escapeHtml(JSON.stringify(a, null, 2))}</textarea>
        <div class="form-actions" style="margin-top:0.6rem">
          <button type="button" class="btn" id="save-article">Save article</button>
        </div>
      </details>`;
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
    const options = [
      `<option value="">None</option>`,
      ...state.templates.map(
        (t) =>
          `<option value="${t.id}" ${run.templateId === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`,
      ),
    ].join("");
    return `
      <p class="hint">Snapshot used at generation time is shown below. Changing assignment clears outline/article so you can regenerate.</p>
      <label>Assign template
        <select id="run-template">${options}</select>
      </label>
      <div class="form-actions" style="margin-top:0.6rem">
        <button type="button" class="btn" id="assign-template">Save assignment</button>
      </div>
      ${
        run.templateMarkdown
          ? `<pre class="pre" style="margin-top:0.8rem">${escapeHtml(run.templateMarkdown)}</pre>`
          : `<p class="empty">No template on this run.</p>`
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
    if (!run.quality) return `<p class="empty">No quality result yet.</p>`;
    return `
      <p>Score <strong>${run.quality.score}</strong> · passed=${run.quality.passed}</p>
      <ul class="issues">
        ${(run.quality.issues || [])
          .map(
            (i) =>
              `<li><strong>${escapeHtml(i.severity)}</strong> ${escapeHtml(i.type)} — ${escapeHtml(i.message)}</li>`,
          )
          .join("")}
      </ul>`;
  }
  if (tab === "stages") {
    return `<pre class="pre">${escapeHtml(JSON.stringify(run.stages || [], null, 2))}</pre>`;
  }
  return `<pre class="pre">${escapeHtml(JSON.stringify(run, null, 2))}</pre>`;
}

$("#create-form").addEventListener("submit", (e) => {
  e.preventDefault();
  createRun(false);
});
$("#create-and-run").addEventListener("click", () => createRun(true));
$("#refresh").addEventListener("click", () => loadRuns().catch((e) => toast(e.message, true)));

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
    await api("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name, markdown, filename }),
    });
    toast("Template saved");
    form.reset();
    await loadTemplates();
  } catch (err) {
    toast(err.message, true);
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

loadHealth();
Promise.all([loadTemplates(), loadRuns(), loadTopics()]).catch((e) => toast(e.message, true));
