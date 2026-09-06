"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { PUBLISH_SITES } from "./constants";
import { featuredImageFor, htmlToMarkdown, markdownToEditorHtml } from "./markdown";
import { RunRecord } from "./types";
import { escapeHtml } from "./utils";

type QualityEditorProps = {
  run: RunRecord;
  busy: boolean;
  onSaveReview: (payload: any) => void;
  onApprove: (payload: any) => void;
  onReject: (notes?: string) => void;
  onRunUpdated: (run: RunRecord) => void;
  toast: (message: string, isError?: boolean) => void;
};

function selectedTargets(run: RunRecord): string[] {
  return Array.isArray(run.publishTargets) && run.publishTargets.length
    ? run.publishTargets
    : ["spanwrap"];
}

export function QualityEditor({
  run,
  busy,
  onSaveReview,
  onApprove,
  onReject,
  onRunUpdated,
  toast,
}: QualityEditorProps) {
  const a = run.article;
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(a?.title || "");
  const [excerpt, setExcerpt] = useState(a?.excerpt || "");
  const [featured, setFeatured] = useState(a?.featuredImage || "");
  const [targets, setTargets] = useState(selectedTargets(run));
  const [previewHtml, setPreviewHtml] = useState("");
  const runId = run.id;
  const contentKey = a?.content || "";

  useEffect(() => {
    setTitle(a?.title || "");
    setExcerpt(a?.excerpt || "");
    setFeatured(a?.featuredImage || "");
    setTargets(selectedTargets(run));
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToEditorHtml(a?.content || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, contentKey]);

  function getContent() {
    if (editorRef.current) return htmlToMarkdown(editorRef.current.innerHTML);
    return a?.content || "";
  }

  function refreshPreview() {
    const live = {
      ...a,
      title,
      excerpt,
      content: getContent() || a?.content,
      featuredImage: featured.trim() || a?.featuredImage,
    };
    const hero = featuredImageFor(run, live);
    const sources = (live.sources || [])
      .map(
        (s: any) =>
          `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.title || s.url)}</a></li>`,
      )
      .join("");
    setPreviewHtml(`
      <article class="post-preview">
        <p class="post-kicker">${escapeHtml(live.slug || "")} · ${escapeHtml((live.tags || []).join(" · "))}</p>
        ${hero ? `<img class="post-hero" src="${escapeHtml(hero)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
        <h1>${escapeHtml(live.title)}</h1>
        ${live.subtitle ? `<p class="post-dek">${escapeHtml(live.subtitle)}</p>` : ""}
        <p class="post-excerpt">${escapeHtml(live.excerpt || "")}</p>
        <div class="post-body">${markdownToEditorHtml(live.content)}</div>
        ${(live.sources || []).length ? `<aside class="post-sources"><h3>Sources</h3><ul>${sources}</ul></aside>` : ""}
      </article>`);
  }

  useEffect(() => {
    refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, excerpt, featured, runId, contentKey]);

  useEffect(() => {
    const editor = editorRef.current;
    const toolbar = rootRef.current?.querySelector(".rich-toolbar");
    if (!editor || !toolbar) return;

    function execCmd(cmd: string, value?: string) {
      editor!.focus();
      document.execCommand(cmd, false, value || undefined);
      refreshPreview();
    }

    const onToolbarClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (!btn || !toolbar!.contains(btn)) return;
      e.preventDefault();
      if (btn.dataset.cmd) execCmd(btn.dataset.cmd);
      if (btn.dataset.block) {
        editor!.focus();
        document.execCommand("formatBlock", false, `<${btn.dataset.block}>`);
        refreshPreview();
      }
      if (btn.dataset.action === "link") {
        const url = prompt("Link URL:");
        if (url && /^https?:\/\//i.test(url)) execCmd("createLink", url);
      }
      if (btn.dataset.action === "image") {
        const url = prompt("Image URL:");
        if (!url || !/^https?:\/\//i.test(url)) return;
        const alt = prompt("Alt text:", "Image") || "Image";
        execCmd(
          "insertHTML",
          `<figure class="post-figure"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" /><figcaption>${escapeHtml(alt)}</figcaption></figure>`,
        );
        if (!featured.trim()) setFeatured(url);
      }
      if (btn.dataset.action === "code") {
        const sel = window.getSelection();
        const text = sel?.toString() || "code here";
        execCmd("insertHTML", `<pre class="pre"><code>${escapeHtml(text)}</code></pre>`);
      }
      if (btn.dataset.action === "hr") execCmd("insertHorizontalRule");
    };

    const onInput = () => refreshPreview();
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        execCmd("bold");
      } else if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        execCmd("italic");
      }
    };

    toolbar.addEventListener("click", onToolbarClick);
    editor.addEventListener("input", onInput);
    editor.addEventListener("keydown", onKeyDown);

    // Quick edit chip
    let host = document.getElementById("quick-edit-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "quick-edit-host";
      host.hidden = true;
      document.body.appendChild(host);
    }
    let savedRange: Range | null = null;
    let selectedText = "";
    let open = false;
    let qeBusy = false;

    function clearHost() {
      if (!host) return;
      host.innerHTML = "";
      host.hidden = true;
      open = false;
    }

    function selectionInEditor() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      const node = sel.anchorNode;
      if (!node || !editor!.contains(node)) return null;
      const text = sel.toString().replace(/\u00a0/g, " ").trim();
      if (text.length < 2) return null;
      return { text, range: sel.getRangeAt(0).cloneRange() };
    }

    function positionNearSelection(el: HTMLElement, range: Range) {
      const rect = range.getBoundingClientRect();
      const pad = 8;
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

    function openQuickEdit() {
      if (!selectedText || !savedRange || !host) return;
      open = true;
      host.hidden = false;
      const preview = selectedText.length > 220 ? `${selectedText.slice(0, 220)}…` : selectedText;
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
      const panel = host.querySelector(".quick-edit-panel") as HTMLElement;
      positionNearSelection(panel, savedRange);
      const input = host.querySelector(".quick-edit-input") as HTMLInputElement | null;
      input?.focus();
      host.querySelectorAll("[data-qe=close]").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          clearHost();
        });
      });
      host.querySelector("[data-qe=submit]")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        void submitQuickEdit();
      });
      input?.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          void submitQuickEdit();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          clearHost();
        }
      });
    }

    async function submitQuickEdit() {
      if (qeBusy || !host) return;
      const input = host.querySelector(".quick-edit-input") as HTMLInputElement | null;
      const status = host.querySelector(".quick-edit-status") as HTMLElement | null;
      const instruction = String(input?.value || "").trim();
      if (instruction.length < 2) {
        toast("Add a short instruction for the rewrite", true);
        input?.focus();
        return;
      }
      if (!run.id || !selectedText) return;
      qeBusy = true;
      const submitBtn = host.querySelector("[data-qe=submit]") as HTMLButtonElement | null;
      if (submitBtn) submitBtn.disabled = true;
      const started = Date.now();
      let tick: ReturnType<typeof setInterval> | null = null;
      if (status) {
        status.hidden = false;
        status.textContent = "Rewriting selection…";
        tick = setInterval(() => {
          status.textContent = `Rewriting selection… ${Math.round((Date.now() - started) / 1000)}s`;
        }, 400);
      }
      try {
        const content = getContent() || run.article?.content || "";
        const result = await api<RunRecord>(
          `/api/runs/${encodeURIComponent(run.id)}/regenerate-selection`,
          {
            method: "POST",
            body: JSON.stringify({ selectedText, instruction, content }),
          },
        );
        onRunUpdated(result);
        if (editorRef.current && result.article?.content) {
          editorRef.current.innerHTML = markdownToEditorHtml(result.article.content);
          refreshPreview();
        }
        clearHost();
        toast(`Selection regenerated (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Regenerate failed";
        if (status) status.textContent = msg;
        toast(msg, true);
        if (submitBtn) submitBtn.disabled = false;
      } finally {
        if (tick) clearInterval(tick);
        qeBusy = false;
      }
    }

    function showRegenChip() {
      if (qeBusy || open || !host) return;
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
      const chip = host.querySelector(".quick-edit-chip") as HTMLElement;
      positionNearSelection(chip, hit.range);
      chip.querySelector("[data-qe=open]")?.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openQuickEdit();
      });
    }

    const onMouseUp = () => requestAnimationFrame(showRegenChip);
    editor.addEventListener("mouseup", onMouseUp);

    return () => {
      toolbar.removeEventListener("click", onToolbarClick);
      editor.removeEventListener("input", onInput);
      editor.removeEventListener("keydown", onKeyDown);
      editor.removeEventListener("mouseup", onMouseUp);
      clearHost();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, contentKey]);

  function collectPayload() {
    if (!a) throw new Error("No article to save");
    const content = getContent().trim();
    if (!title.trim()) throw new Error("Title is required");
    if (!excerpt.trim()) throw new Error("Excerpt is required");
    if (!content) throw new Error("Body is required");
    if (!targets.length) throw new Error("Select at least one publishing site");
    return {
      article: {
        ...a,
        title: title.trim(),
        excerpt: excerpt.trim(),
        content,
        featuredImage: featured.trim() || null,
        seoTitle: a.seoTitle || title.trim(),
        seoDescription: a.seoDescription || excerpt.trim(),
      },
      publishTargets: targets,
    };
  }

  if (!a) {
    return <p className="empty">No draft yet. Assign a template above, then Run to review or Generate.</p>;
  }

  const q = run.quality;

  return (
    <div ref={rootRef}>
      {q ? (
        <div className="quality-score">
          Score <strong>{q.score}</strong> · {q.passed ? "pass" : "flag"}
          <ul className="issues">
            {(q.issues || []).map((i: any, idx: number) => (
              <li key={idx}>
                <strong>{i.severity}</strong> {i.type} — {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="hint">
        Tip: select any passage in the editor to open <strong>Regenerate</strong> (Quick Edit).
      </p>
      <div className="quality-single-layout">
        <div className="quality-editor doc-style-editor">
          <input
            className="doc-title-input"
            placeholder="Document Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="doc-excerpt-input"
            placeholder="Subtitle / Excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
          />
          <div className="rich-editor">
            <div className="rich-toolbar">
              <button type="button" data-cmd="bold" title="Bold (Ctrl+B)">
                <strong>B</strong>
              </button>
              <button type="button" data-cmd="italic" title="Italic (Ctrl+I)">
                <em>I</em>
              </button>
              <span className="toolbar-sep" />
              <button type="button" data-block="h2" title="Heading 2">
                H2
              </button>
              <button type="button" data-block="h3" title="Heading 3">
                H3
              </button>
              <button type="button" data-block="p" title="Paragraph">
                ¶
              </button>
              <span className="toolbar-sep" />
              <button type="button" data-cmd="insertUnorderedList" title="Bullet list">
                • List
              </button>
              <button type="button" data-cmd="insertOrderedList" title="Numbered list">
                1. List
              </button>
              <span className="toolbar-sep" />
              <button type="button" data-action="link" title="Insert link">
                🔗
              </button>
              <button type="button" data-action="image" title="Insert image">
                🖼️
              </button>
              <button type="button" data-action="code" title="Code block">
                {"</>"}
              </button>
              <button type="button" data-action="hr" title="Horizontal rule">
                ─
              </button>
            </div>
            <div
              ref={editorRef}
              id="draft-content-editor"
              className="rich-editor-content"
              contentEditable
              suppressContentEditableWarning
            />
          </div>
          <div className="doc-meta-panel" style={{ marginTop: "1rem" }}>
            <label>
              Featured image URL (optional)
              <input
                placeholder="https://"
                value={featured}
                onChange={(e) => setFeatured(e.target.value)}
              />
            </label>
            <fieldset className="destinations" style={{ marginTop: "1rem" }}>
              <legend>Publish to</legend>
              {PUBLISH_SITES.map((site) => (
                <label key={site.id} className="check">
                  <input
                    type="checkbox"
                    checked={targets.includes(site.id)}
                    onChange={(e) => {
                      setTargets((prev) =>
                        e.target.checked
                          ? [...prev, site.id]
                          : prev.filter((id) => id !== site.id),
                      );
                    }}
                  />
                  <span>
                    <strong>{site.label}</strong> · {site.note}
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          <div className="form-actions" style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                try {
                  onSaveReview(collectPayload());
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Save failed", true);
                }
              }}
            >
              Save draft
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                const notes = prompt("Reject notes (optional)") ?? undefined;
                onReject(notes);
              }}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => {
                try {
                  onApprove(collectPayload());
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Approve failed", true);
                }
              }}
            >
              Approve
            </button>
          </div>
        </div>
      </div>
      {previewHtml ? (
        <div
          id="quality-preview-mount"
          style={{ display: "none" }}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : null}
    </div>
  );
}
