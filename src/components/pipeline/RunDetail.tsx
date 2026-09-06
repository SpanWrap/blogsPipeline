"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { DETAIL_TABS, PUBLISH_SITES, TAB_LABELS } from "./constants";
import { featuredImageFor, markdownToEditorHtml } from "./markdown";
import { QualityEditor } from "./QualityEditor";
import { ProgressLine, RunRecord, TemplateRecord } from "./types";
import { escapeHtml, statusClass } from "./utils";

type RunDetailProps = {
  run: RunRecord | null;
  templates: TemplateRecord[];
  tab: string;
  busy: boolean;
  hasGeminiKey: boolean;
  generateImages: boolean;
  progress: { active: boolean; action: string; lines: ProgressLine[] };
  onTab: (tab: string) => void;
  onAct: (action: string, body?: Record<string, unknown>) => Promise<unknown> | unknown;
  onGenerateImagesChange: (value: boolean) => void;
  onRunUpdated: (run: RunRecord) => void;
  toast: (message: string, isError?: boolean) => void;
};

function PostArticle({ run, article }: { run: RunRecord; article: any }) {
  if (!article) return <p className="empty">No draft yet.</p>;
  const hero = featuredImageFor(run, article);
  return (
    <article className="post-preview">
      <p className="post-kicker">
        {article.slug || ""} · {(article.tags || []).join(" · ")}
      </p>
      {hero ? (
        <img className="post-hero" src={hero} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : null}
      <h1>{article.title}</h1>
      {article.subtitle ? <p className="post-dek">{article.subtitle}</p> : null}
      <p className="post-excerpt">{article.excerpt || ""}</p>
      <div
        className="post-body"
        dangerouslySetInnerHTML={{ __html: markdownToEditorHtml(article.content) }}
      />
      {(article.sources || []).length ? (
        <aside className="post-sources">
          <h3>Sources</h3>
          <ul>
            {(article.sources || []).map((s: any, i: number) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </article>
  );
}

function DiffMount({ runId }: { runId: string }) {
  const [html, setHtml] = useState('<p class="hint">Loading diff…</p>');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const diff = await api<{ hunks?: { type: string; text?: string }[] }>(
          `/api/runs/${encodeURIComponent(runId)}/diff`,
          { method: "POST", body: "{}" },
        );
        const hunks = diff.hunks || [];
        if (!hunks.length) {
          if (!cancelled) setHtml('<p class="empty">No line differences recorded.</p>');
          return;
        }
        if (!cancelled) {
          setHtml(
            hunks
              .slice(0, 500)
              .map((h) => {
                const cls = h.type === "add" ? "diff-add" : h.type === "del" ? "diff-del" : "diff-same";
                return `<div class="${cls}"><code>${escapeHtml(h.text || " ")}</code></div>`;
              })
              .join(""),
          );
        }
      } catch (e) {
        if (!cancelled) {
          setHtml(`<p class="empty">${escapeHtml(e instanceof Error ? e.message : "Diff failed")}</p>`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);
  return <div className="diff-mount" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function RunDetail({
  run,
  templates,
  tab,
  busy,
  hasGeminiKey,
  generateImages,
  progress,
  onTab,
  onAct,
  onGenerateImagesChange,
  onRunUpdated,
  toast,
}: RunDetailProps) {
  const [assignTemplateId, setAssignTemplateId] = useState(run?.templateId || "");
  const [outlineJson, setOutlineJson] = useState("");
  const [articleJson, setArticleJson] = useState("");

  useEffect(() => {
    setAssignTemplateId(run?.templateId || "");
    setOutlineJson(run?.outline ? JSON.stringify(run.outline, null, 2) : "");
    setArticleJson(run?.article ? JSON.stringify(run.article, null, 2) : "");
  }, [run?.id, run?.templateId, run?.outline, run?.article]);

  if (!run) {
    return (
      <div className="detail-panel">
        <p className="empty">Select a run to inspect sources, outline, article, and actions.</p>
      </div>
    );
  }

  const retryStageLabel = run.failedStage
    ? run.failedStage.charAt(0).toUpperCase() + run.failedStage.slice(1)
    : null;
  // INTERRUPTED / failed mid-pipeline: always continue via runUntilReview so earlier
  // artifacts (research/outline/draft) are reused instead of restarting from scratch.
  const continueViaRun =
    run.errorCode === "INTERRUPTED" ||
    (run.retryable &&
      run.failedStage &&
      ["quality", "generation", "images", "outline"].includes(run.failedStage) &&
      Boolean(run.article || run.outline || run.analysis));
  const retryAction = continueViaRun
    ? "run"
    : run.failedStage === "research"
      ? "research"
      : run.failedStage === "outline"
        ? "outline"
        : run.failedStage === "generation"
          ? "generate"
          : run.failedStage === "quality"
            ? "quality-check"
            : "run";
  const retryLabel = continueViaRun
    ? `Continue from ${retryStageLabel || run.lastCheckpoint || "last checkpoint"}`
    : `Retry ${retryStageLabel}`;
  const stalledInFlight =
    !progress.active && ["RESEARCHING", "GENERATING", "QUALITY_CHECK"].includes(run.status);
  const runningStage = (run.stages || []).find((s: any) => s.status === "running");
  const checkpointHint =
    run.checkpointVersion > 0
      ? ` · checkpoint v${run.checkpointVersion}${run.lastCheckpoint ? ` (${run.lastCheckpoint})` : ""}`
      : "";

  function renderTab() {
    if (tab === "quality") {
      return (
        <QualityEditor
          run={run!}
          busy={busy}
          toast={toast}
          onRunUpdated={onRunUpdated}
          onSaveReview={(payload) => onAct("save-review", payload)}
          onApprove={async (payload) => {
            const saved = await onAct("save-review", payload);
            if (!saved) return;
            const notes = prompt("Approve notes (optional)") ?? undefined;
            await onAct("approve", notes ? { notes } : {});
          }}
          onReject={(notes) => onAct("reject", notes ? { notes } : {})}
        />
      );
    }
    if (tab === "article") {
      const a = run!.article;
      if (!a) return <p className="empty">No article yet. Run generate or Write blog from Runs.</p>;
      const sections = (String(a.content).match(/^##\s+(.+)$/gm) || []).map((h: string) =>
        h.replace(/^##\s+/, ""),
      );
      return (
        <>
          {run!.thumbnailVariants?.length ? (
            <div className="thumb-ab">
              <p className="hint">Thumbnail A/B</p>
              {run!.thumbnailVariants.map((v: any) => (
                <label key={v.id} className={`thumb-choice ${v.selected ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="thumb"
                    value={v.id}
                    checked={Boolean(v.selected)}
                    onChange={() => onAct("select-thumbnail", { variantId: v.id })}
                  />{" "}
                  {v.label}
                  <br />
                  <img src={v.url} alt="" />
                </label>
              ))}
            </div>
          ) : null}
          {sections.length ? (
            <div className="section-regen">
              <p className="hint">Section regenerate</p>
              {sections.map((h: string) => (
                <button
                  key={h}
                  type="button"
                  className="btn"
                  onClick={() => onAct("regenerate-section", { heading: h })}
                >
                  ↻ {h}
                </button>
              ))}
            </div>
          ) : null}
          <PostArticle run={run!} article={a} />
          <details style={{ marginTop: "1rem" }}>
            <summary>Edit article JSON</summary>
            <textarea value={articleJson} onChange={(e) => setArticleJson(e.target.value)} />
            <div className="form-actions" style={{ marginTop: "0.6rem" }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  try {
                    onAct("article-update", { article: JSON.parse(articleJson) });
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "Invalid JSON", true);
                  }
                }}
              >
                Save article
              </button>
            </div>
          </details>
        </>
      );
    }
    if (tab === "seo") {
      const pack = run!.seoPack;
      if (!pack) return <p className="empty">No SEO pack yet — accept a draft or run quality.</p>;
      return (
        <div className="seo-pack">
          <p className="hint">
            Primary keyword: <strong>{pack.primaryKeyword || ""}</strong>
          </p>
          <h4>Title variants</h4>
          {(pack.titles || []).map((t: string) => (
            <button
              key={t}
              type="button"
              className="btn"
              onClick={() => {
                onAct("apply-seo", { title: t });
                toast("SEO title applied");
              }}
            >
              {t}
            </button>
          ))}
          <h4>Meta descriptions</h4>
          {(pack.descriptions || []).map((t: string) => (
            <button
              key={t}
              type="button"
              className="btn"
              onClick={() => {
                onAct("apply-seo", { description: t });
                toast("Meta description applied");
              }}
            >
              {t}
            </button>
          ))}
          <h4>Slug suggestions</h4>
          {(pack.slugSuggestions || []).map((t: string) => (
            <button
              key={t}
              type="button"
              className="btn"
              onClick={() => {
                onAct("apply-seo", { slug: t });
                toast("Slug applied");
              }}
            >
              {t}
            </button>
          ))}
          <h4>Long-tail</h4>
          <p>{(pack.longTailKeywords || []).join(" · ")}</p>
        </div>
      );
    }
    if (tab === "facts") {
      const cards = run!.factCards || [];
      const brief = run!.competitorBrief;
      const hasAnalysis = Boolean(run!.analysis);
      const hasSources = Boolean(run!.sources?.length);
      if (!hasSources && !hasAnalysis) {
        return (
          <p className="empty">
            No research yet. Click <strong>Run to review</strong> or <strong>Research</strong> first.
          </p>
        );
      }
      if (!cards.length && !brief) {
        return (
          <>
            <p className="empty">
              Research finished, but no claims/arguments were extracted yet. Re-run{" "}
              <strong>Research</strong> or continue to outline.
            </p>
            <p className="hint">
              Sources on this run: {run!.sources?.length || 0}. Analysis: {hasAnalysis ? "yes" : "no"}.
            </p>
          </>
        );
      }
      return (
        <>
          {brief ? (
            <div className="competitor-brief">
              <h3>Competitor angle brief</h3>
              <p>{brief.summary}</p>
              <h4>Angles to own</h4>
              <ul>
                {(brief.anglesToOwn || []).map((x: string, i: number) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <h4>Angles to avoid</h4>
              <ul>
                {(brief.anglesToAvoid || []).map((x: string, i: number) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <h4>Competing viewpoints</h4>
              <ul>
                {(brief.competingViewpoints || []).map((x: string, i: number) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <h3>Fact cards {cards.length ? `(${cards.length})` : ""}</h3>
          {cards.length ? (
            cards.map((c: any, i: number) => (
              <article key={i} className={`fact-card ${c.grounded ? "ok" : "warn"}`}>
                <strong>{c.claim}</strong>
                <div className="meta">
                  {c.category} · confidence {Math.round((c.confidence || 0) * 100)}% ·{" "}
                  {c.grounded ? "grounded" : "needs source"}
                </div>
                <ul>
                  {(c.sources || []).map((s: any, j: number) => (
                    <li key={j}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          ) : (
            <p className="hint">No structured claims yet — competitor brief above still applies.</p>
          )}
        </>
      );
    }
    if (tab === "diff") {
      if (!run!.article) {
        return (
          <p className="empty">
            No draft yet — Diff compares article versions after generate / edit / readability / Quick
            Edit.
          </p>
        );
      }
      if (!run!.previousArticle) {
        return (
          <p className="empty">
            No previous version yet. Diff appears after you generate a new draft over an existing
            one (Generate), or after Save / Readability pass / section regenerate / Quick Edit.
          </p>
        );
      }
      return (
        <div className="diff-panel">
          <p className="hint">
            Comparing <strong>{run!.previousArticle.title || "previous"}</strong> →{" "}
            <strong>{run!.article.title || "current"}</strong>
          </p>
          <DiffMount runId={run!.id} />
        </div>
      );
    }
    if (tab === "repurpose") {
      const p = run!.repurposePack;
      if (!p) return <p className="empty">No repurpose pack yet — run quality or distribute.</p>;
      return (
        <div className="repurpose-pack">
          <h4>X / Twitter</h4>
          <pre className="pre">{p.tweet}</pre>
          <h4>LinkedIn</h4>
          <pre className="pre">{p.linkedInPost}</pre>
          <h4>Newsletter</h4>
          <pre className="pre">{p.newsletterBlurb}</pre>
          <h4>Thread</h4>
          <pre className="pre">{(p.thread || []).join("\n\n")}</pre>
          <h4>YouTube short outline</h4>
          <ul>
            {(p.youtubeShortOutline || []).map((x: string, i: number) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <h4>Reddit</h4>
          <pre className="pre">{`${p.redditTitle}\n\n${p.redditBody}`}</pre>
        </div>
      );
    }
    if (tab === "publish") {
      const a = run!.article;
      if (!a) {
        return (
          <p className="empty">No draft yet. Assign a template, then Run to review or Generate.</p>
        );
      }
      const targets =
        Array.isArray(run!.publishTargets) && run!.publishTargets.length
          ? run!.publishTargets
          : ["spanwrap"];
      const destLabels = targets
        .map((id: string) => PUBLISH_SITES.find((s) => s.id === id)?.label || id)
        .join(", ");
      const canPublish = ["APPROVED", "PUBLISH_FAILED"].includes(run!.status);
      const results =
        Array.isArray(run!.publishResults) && run!.publishResults.length
          ? run!.publishResults
          : run!.publishResult
            ? [run!.publishResult]
            : [];
      return (
        <>
          <p className="hint">
            Approved draft for <strong>{destLabels || "no sites selected"}</strong>. Spanwrap
            publishes now. Medium and Substack are planned connectors.
          </p>
          <PostArticle run={run!} article={a} />
          {results.length ? (
            <ul className="issues" style={{ marginTop: "1rem" }}>
              {results.map((r: any, i: number) => {
                const label = r.target
                  ? PUBLISH_SITES.find((s) => s.id === r.target)?.label || r.target
                  : "Publish";
                const ok = r.success ? "Published" : r.statusCode === 501 ? "Planned" : "Failed";
                return (
                  <li key={i} style={{ marginBottom: "0.5rem" }}>
                    <strong>{label}</strong> · {ok} — {r.message || ""}
                    {r.externalId ? ` · id ${r.externalId}` : ""}
                    {r.raw?.html ? (
                      <a
                        href={`data:text/html;charset=utf-8,${encodeURIComponent(r.raw.html)}`}
                        download={r.raw.filename || "draft.html"}
                        className="btn"
                        style={{
                          marginLeft: "0.5rem",
                          textDecoration: "none",
                          display: "inline-block",
                        }}
                      >
                        Download HTML
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="form-actions" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn primary"
              disabled={!canPublish || busy}
              onClick={() => onAct("publish")}
            >
              Publish to selected sites
            </button>
          </div>
          {!canPublish ? (
            <p className="hint">
              Approve this draft in the Quality tab first (current status: {run!.status}).
            </p>
          ) : null}
        </>
      );
    }
    if (tab === "outline") {
      if (!run!.outline) return <p className="empty">No outline yet.</p>;
      return (
        <>
          <textarea value={outlineJson} onChange={(e) => setOutlineJson(e.target.value)} />
          <div className="form-actions" style={{ marginTop: "0.6rem" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                try {
                  onAct("outline-update", { outline: JSON.parse(outlineJson) });
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Invalid JSON", true);
                }
              }}
            >
              Save outline
            </button>
          </div>
        </>
      );
    }
    if (tab === "template") {
      return (
        <>
          <p className="hint">
            This snapshot is sent to the LLM as section guidelines and instructions with the topic and
            sources. Re-assign from the header above to change it (that clears outline and draft so they
            can regenerate).
          </p>
          {run!.templateMarkdown ? (
            <pre className="pre">{run!.templateMarkdown}</pre>
          ) : (
            <p className="empty">No template on this run. Use Assign template in the header.</p>
          )}
        </>
      );
    }
    if (tab === "sources") {
      if (!run!.sources?.length) return <p className="empty">No sources yet.</p>;
      return (
        <>
          {run!.sources.map((s: any, i: number) => (
            <article key={i} style={{ marginBottom: "1rem" }}>
              <strong>{s.title}</strong>
              <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                {s.url} · score {s.relevanceScore}
              </div>
              <pre className="pre" style={{ maxHeight: 180 }}>
                {(s.content || "").slice(0, 1200)}
              </pre>
            </article>
          ))}
        </>
      );
    }
    if (tab === "analysis") {
      if (!run!.analysis) return <p className="empty">No analysis yet.</p>;
      return <pre className="pre">{JSON.stringify(run!.analysis, null, 2)}</pre>;
    }
    if (tab === "stages") {
      return (
        <pre className="pre">
          {JSON.stringify(
            {
              checkpointVersion: run!.checkpointVersion ?? 0,
              lastCheckpoint: run!.lastCheckpoint ?? null,
              checkpoints: run!.checkpoints ?? [],
              stages: run!.stages || [],
            },
            null,
            2,
          )}
        </pre>
      );
    }
    return <pre className="pre">{JSON.stringify(run, null, 2)}</pre>;
  }

  return (
    <div className="detail-panel">
      <div className="detail-head">
        <div>
          <p className="brand">{run.id}</p>
          <h2>{run.brief?.topic}</h2>
          <p className="meta-line">
            <span className={`status ${statusClass(run.status)}`}>{run.status}</span>
            {run.templateName ? ` · template: ${run.templateName}` : " · no template"}
            {checkpointHint}
            {run.quality
              ? ` · quality ${run.quality.score} (${run.quality.passed ? "pass" : "flag"})`
              : ""}
          </p>
          {run.error ? (
            <div className="run-error-block">
              <p className="run-error">{run.error}</p>
              {run.failedStage ? (
                <p className="run-error-meta">
                  Stage: <strong>{retryStageLabel}</strong>
                  {run.errorCode ? (
                    <>
                      {" "}
                      · Code: <code>{run.errorCode}</code>
                    </>
                  ) : null}
                  {run.retryable ? (
                    <>
                      {" "}
                      · <span className="retryable-badge">Retryable</span>
                    </>
                  ) : null}
                </p>
              ) : null}
              {run.retryable && run.failedStage ? (
                <button className="btn" disabled={busy} onClick={() => onAct(retryAction)}>
                  ⟳ {retryLabel}
                </button>
              ) : null}
            </div>
          ) : stalledInFlight ? (
            <div className="run-error-block">
              <p className="run-error">
                This run is stuck on <strong>{run.status}</strong> with no live work. Generation
                likely died (server restart or timeout).
              </p>
              <p className="run-error-meta">
                Refresh the page or click <strong>Run to review</strong> / Retry to continue from the
                interrupted stage.
              </p>
              <button className="btn" disabled={busy} onClick={() => onAct("run")}>
                ⟳ Resume run
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="template-bar">
        <label>
          Assign template
          <select
            value={assignTemplateId || ""}
            onChange={(e) => setAssignTemplateId(e.target.value)}
          >
            <option value="">None (default structure)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => onAct("assign-template", { templateId: assignTemplateId || null })}
        >
          Assign template
        </button>
      </div>
      <p className="hint">
        <strong>Run to review</strong> runs research → outline → draft → quality. If a run failed, it
        resumes from the failed stage. Tabs below inspect/edit results — select text in Quality to
        Quick Edit.
        {hasGeminiKey ? " Enable Gemini images to generate art with the draft." : ""}
      </p>
      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => onAct("run")}>
          Run to review
        </button>
        <label
          className="check-inline"
          title={
            hasGeminiKey
              ? "Generate hero/section images with Gemini after the draft"
              : "Add GEMINI_API_KEY in .env to enable"
          }
        >
          <input
            type="checkbox"
            disabled={!hasGeminiKey}
            checked={generateImages && hasGeminiKey}
            onChange={(e) => onGenerateImagesChange(e.target.checked && hasGeminiKey)}
          />
          Gemini images
        </label>
        <button className="btn" disabled={busy} onClick={() => onTab("publish")}>
          Open publish
        </button>
        <button
          className="btn"
          disabled={busy}
          title="Approve + publish + build social/newsletter pack"
          onClick={() => onAct("distribute")}
        >
          One-click distribute
        </button>
        <button className="btn" disabled={busy} onClick={() => onAct("readability-pass")}>
          Readability pass
        </button>
        {run.status === "PUBLISHED" || run.status === "APPROVED" ? (
          <button className="btn" disabled={busy} onClick={() => onAct("refresh")}>
            Refresh post
          </button>
        ) : null}
      </div>
      <details className="stage-actions">
        <summary>Run one stage (advanced)</summary>
        <p className="hint">
          Use only to retry a single step after a failure. Prefer <strong>Run to review</strong> for a
          full draft.
        </p>
        <div className="actions">
          <button className="btn" disabled={busy} onClick={() => onAct("research")}>
            Research
          </button>
          <button className="btn" disabled={busy} onClick={() => onAct("outline")}>
            Outline
          </button>
          <button className="btn" disabled={busy} onClick={() => onAct("generate")}>
            Generate
          </button>
          <button className="btn" disabled={busy} onClick={() => onAct("quality-check")}>
            Quality score
          </button>
        </div>
      </details>
      <div className="progress-panel">
        <div className="progress-head">
          <strong>Pipeline activity</strong>
          {progress.active ? (
            <span className="status warn">Running {progress.action}</span>
          ) : stalledInFlight ? (
            <span className="status bad">Stalled</span>
          ) : (
            <span className="status">Idle</span>
          )}
        </div>
        <ul className="action-progress-list">
          {progress.lines.length ? (
            progress.lines.map((line, i) => (
              <li key={`${line.at}-${i}`}>
                <span>{line.at}</span> {line.text}
              </li>
            ))
          ) : stalledInFlight ? (
            <li className="empty">
              No live activity — status is {run.status}
              {runningStage
                ? ` (${runningStage.stage} started ${runningStage.startedAt || ""})`
                : ""}
              , but this browser session is idle. Refresh or resume the run.
            </li>
          ) : (
            <li className="empty">No activity yet.</li>
          )}
        </ul>
      </div>
      <div className="tabs">
        {DETAIL_TABS.map((t) => (
          <button
            key={t}
            type="button"
            data-tab={t}
            className={tab === t ? "active" : ""}
            onClick={() => onTab(t)}
          >
            {TAB_LABELS[t] || t}
          </button>
        ))}
      </div>
      <div className="section">{renderTab()}</div>
    </div>
  );
}
