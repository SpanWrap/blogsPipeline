"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { featuredImageFor, htmlToMarkdown, markdownToEditorHtml } from "./markdown";
import {
  applyContentHighlights,
  anchorQualityIssues,
  type AnchoredQualityIssue,
} from "./quality-highlights";
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
  /** Optional extras from the old Preview tab (thumbnails / section regen). */
  extras?: ReactNode;
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
  extras,
}: QualityEditorProps) {
  const a = run.article;
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const excerptRef = useRef<HTMLTextAreaElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(a?.title || "");
  const [excerpt, setExcerpt] = useState(a?.excerpt || "");
  const [featured, setFeatured] = useState(a?.featuredImage || "");
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const runId = run.id;
  const contentKey = a?.content || "";
  const heroSrc = featuredImageFor(run, {
    ...a,
    featuredImage: featured.trim() || a?.featuredImage,
  });

  const anchored = useMemo(
    () =>
      anchorQualityIssues(run.quality?.issues, {
        title: a?.title || title,
        excerpt: a?.excerpt || excerpt,
        content: a?.content || "",
        keywords: a?.keywords || [],
      }),
    [run.quality?.issues, a?.title, a?.excerpt, a?.content, a?.keywords, title, excerpt],
  );

  const applyHighlights = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    applyContentHighlights(
      editor,
      anchored.filter((i) => i.field === "content"),
    );

    // Field-level flags on title / excerpt inputs
    const titleEl = titleRef.current;
    const excerptEl = excerptRef.current;
    titleEl?.classList.remove("qi-field-error", "qi-field-warning", "qi-field-info");
    excerptEl?.classList.remove("qi-field-error", "qi-field-warning", "qi-field-info");
    for (const issue of anchored) {
      if (issue.field === "title" && titleEl) {
        titleEl.classList.add(`qi-field-${issue.severity}`);
        titleEl.dataset.qiId = issue.id;
        titleEl.title = issue.message;
      }
      if (issue.field === "excerpt" && excerptEl) {
        excerptEl.classList.add(`qi-field-${issue.severity}`);
        excerptEl.dataset.qiId = issue.id;
        excerptEl.title = issue.message;
      }
    }
  }, [anchored]);

  useEffect(() => {
    setTitle(a?.title || "");
    setExcerpt(a?.excerpt || "");
    setFeatured(a?.featuredImage || "");
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToEditorHtml(a?.content || "");
      // Apply after paint so contentEditable is ready.
      requestAnimationFrame(() => applyHighlights());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, contentKey, a?.featuredImage, run.quality?.score]);

  useEffect(() => {
    applyHighlights();
  }, [applyHighlights]);

  function getContent() {
    if (editorRef.current) return htmlToMarkdown(editorRef.current.innerHTML);
    return a?.content || "";
  }

  function showTooltip(target: HTMLElement, message: string) {
    const tip = tooltipRef.current;
    if (!tip) return;
    tip.hidden = false;
    tip.textContent = message;
    const rect = target.getBoundingClientRect();
    const pad = 8;
    tip.style.visibility = "hidden";
    const h = tip.offsetHeight || 40;
    const w = tip.offsetWidth || 220;
    let top = rect.top - h - pad;
    if (top < pad) top = Math.min(window.innerHeight - h - pad, rect.bottom + pad);
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.style.visibility = "visible";
  }

  function hideTooltip() {
    const tip = tooltipRef.current;
    if (!tip) return;
    tip.hidden = true;
  }

  function scrollToIssue(issue: AnchoredQualityIssue) {
    setActiveIssueId(issue.id);
    setPanelOpen(true);
    if (issue.field === "title") {
      titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleRef.current?.focus();
      return;
    }
    if (issue.field === "excerpt") {
      excerptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      excerptRef.current?.focus();
      return;
    }
    if (issue.field === "content") {
      const mark = editorRef.current?.querySelector(
        `mark.qi-mark[data-qi-id="${issue.id.replace(/"/g, "")}"]`,
      ) as HTMLElement | null;
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.classList.add("qi-flash");
        showTooltip(mark, `${issue.severity}: ${issue.message}`);
        window.setTimeout(() => mark.classList.remove("qi-flash"), 1600);
        return;
      }
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    const editor = editorRef.current;
    const toolbar = rootRef.current?.querySelector(".rich-toolbar");
    if (!editor || !toolbar) return;

    function execCmd(cmd: string, value?: string) {
      editor!.focus();
      document.execCommand(cmd, false, value || undefined);
    }

    const onToolbarClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (!btn || !toolbar!.contains(btn)) return;
      e.preventDefault();
      if (btn.dataset.cmd) execCmd(btn.dataset.cmd);
      if (btn.dataset.block) {
        editor!.focus();
        document.execCommand("formatBlock", false, `<${btn.dataset.block}>`);
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

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        execCmd("bold");
      } else if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        execCmd("italic");
      }
    };

    const onEditorOver = (e: Event) => {
      const mark = (e.target as HTMLElement).closest?.("mark.qi-mark") as HTMLElement | null;
      if (!mark || !editor!.contains(mark)) return;
      const msg = mark.dataset.qiMessage || "";
      if (msg) showTooltip(mark, msg);
      setActiveIssueId(mark.dataset.qiId || null);
    };
    const onEditorOut = (e: Event) => {
      const related = (e as MouseEvent).relatedTarget as Node | null;
      const mark = (e.target as HTMLElement).closest?.("mark.qi-mark");
      if (mark && related && (mark as HTMLElement).contains(related)) return;
      hideTooltip();
    };

    toolbar.addEventListener("click", onToolbarClick);
    editor.addEventListener("keydown", onKeyDown);
    editor.addEventListener("mouseover", onEditorOver);
    editor.addEventListener("mouseout", onEditorOut);

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
          requestAnimationFrame(() => applyHighlights());
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
      editor.removeEventListener("keydown", onKeyDown);
      editor.removeEventListener("mouseover", onEditorOver);
      editor.removeEventListener("mouseout", onEditorOut);
      editor.removeEventListener("mouseup", onMouseUp);
      clearHost();
      hideTooltip();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, contentKey, applyHighlights]);

  function collectPayload() {
    if (!a) throw new Error("No article to save");
    const content = getContent().trim();
    if (!title.trim()) throw new Error("Title is required");
    if (!excerpt.trim()) throw new Error("Excerpt is required");
    if (!content) throw new Error("Body is required");
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
      // Destinations are chosen on the Publish tab; keep existing selection.
      publishTargets: selectedTargets(run),
    };
  }

  if (!a) {
    return <p className="empty">No draft yet. Assign a template above, then Run to review or Generate.</p>;
  }

  const q = run.quality;
  const issueCount = anchored.length;
  const errorCount = anchored.filter((i) => i.severity === "error").length;
  const warningCount = anchored.filter((i) => i.severity === "warning").length;

  return (
    <div ref={rootRef} className="preview-quality-root">
      {extras}

      <div className="qi-dock">
        <button
          type="button"
          className={`qi-fab${panelOpen ? " is-open" : ""}${errorCount ? " has-error" : ""}${!issueCount ? " is-empty" : ""}`}
          aria-expanded={panelOpen}
          aria-controls="qi-issues-panel"
          title={issueCount ? "Quality warnings" : q ? "No quality issues" : "No quality report yet"}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <span className="qi-fab-icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3l9 16H3L12 3z" />
              <path d="M12 10v4" />
              <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="qi-fab-count">{issueCount}</span>
        </button>
        {panelOpen ? (
          <aside id="qi-issues-panel" className="qi-panel" role="dialog" aria-label="Quality issues">
            <div className="qi-panel-head">
              <div>
                <strong>Quality</strong>
                {q ? <span className="qi-panel-score"> · {q.score}</span> : null}
              </div>
              <button type="button" className="qi-panel-close" onClick={() => setPanelOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            {issueCount ? (
              <ul className="qi-panel-list">
                {anchored.map((issue) => (
                  <li key={issue.id}>
                    <button
                      type="button"
                      className={`qi-panel-item qi-${issue.severity}${activeIssueId === issue.id ? " is-active" : ""}`}
                      onClick={() => scrollToIssue(issue)}
                    >
                      <span className="qi-panel-sev">{issue.severity}</span>
                      <span className="qi-panel-msg">{issue.message}</span>
                      <span className="qi-panel-type">{issue.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="qi-panel-empty">
                {q
                  ? "No issues flagged for this draft."
                  : "No quality report yet. Use Run to review or Quality check."}
              </p>
            )}
          </aside>
        ) : null}
      </div>

      <div className="quality-single-layout">
        <div className="quality-editor doc-style-editor">
          {q ? (
            <div className="quality-score-bar">
              <span>
                Quality <strong>{q.score}</strong> · {q.passed ? "pass" : "flag"}
              </span>
              <span className="quality-score-meta">
                {errorCount ? `${errorCount} errors` : null}
                {errorCount && warningCount ? " · " : null}
                {warningCount ? `${warningCount} warnings` : null}
                {!errorCount && !warningCount && issueCount ? `${issueCount} notes` : null}
                {!issueCount ? "No issues" : null}
              </span>
            </div>
          ) : null}

          <input
            ref={titleRef}
            className="doc-title-input"
            placeholder="Document Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onMouseEnter={(e) => {
              const msg = (e.currentTarget as HTMLInputElement).title;
              if (msg) showTooltip(e.currentTarget, msg);
            }}
            onMouseLeave={() => hideTooltip()}
          />
          <textarea
            ref={excerptRef}
            className="doc-excerpt-input"
            placeholder="Subtitle / Excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            onMouseEnter={(e) => {
              const msg = (e.currentTarget as HTMLTextAreaElement).title;
              if (msg) showTooltip(e.currentTarget, msg);
            }}
            onMouseLeave={() => hideTooltip()}
          />
          {heroSrc ? (
            <figure className="draft-featured-figure">
              <img
                className="post-hero"
                src={heroSrc}
                alt={title ? `Featured image for ${title}` : "Featured image"}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </figure>
          ) : null}
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
          <p className="hint">
            Hover underlined text for quality tips. Select a passage to{" "}
            <strong>Regenerate</strong> (Quick Edit). Choose destinations on the{" "}
            <strong>Publish</strong> tab.
          </p>
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

      <div ref={tooltipRef} className="qi-tooltip" hidden role="tooltip" />
    </div>
  );
}
