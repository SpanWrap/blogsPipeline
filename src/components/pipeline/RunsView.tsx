"use client";

import { DashboardData, RunRecord } from "./types";
import { statusClass } from "./utils";
import { RunDetail } from "./RunDetail";
import { ProgressLine, TemplateRecord } from "./types";

type RunsViewProps = {
  runs: RunRecord[];
  dashboard: DashboardData | null;
  selectedId: string | null;
  run: RunRecord | null;
  templates: TemplateRecord[];
  tab: string;
  busy: boolean;
  hasGeminiKey: boolean;
  generateImages: boolean;
  progress: { active: boolean; action: string; lines: ProgressLine[] };
  onRefresh: () => void;
  onWriteBlog: () => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onTab: (tab: string) => void;
  onAct: (action: string, body?: Record<string, unknown>) => Promise<any>;
  onGenerateImagesChange: (value: boolean) => void;
  onRunUpdated: (run: RunRecord) => void;
  toast: (message: string, isError?: boolean) => void;
};

export function RunsView(props: RunsViewProps) {
  const {
    runs,
    dashboard,
    selectedId,
    run,
    busy,
    onRefresh,
    onWriteBlog,
    onSelect,
    onDelete,
  } = props;

  return (
    <section className="home-pane home-pane-runs">
      <div className={`runs-layout${selectedId ? " has-selection" : ""}`}>
        <aside className="runs-rail">
          <div className="panel-head">
            <h2>Runs</h2>
            <button type="button" className="btn ghost" disabled={busy} onClick={onRefresh}>
              Refresh
            </button>
          </div>
          <div className="resume-dashboard">
            {dashboard?.buckets?.length ? (
              <>
                <div className="dash-title">Smart resume</div>
                {dashboard.buckets.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    className="dash-bucket"
                    onClick={() => {
                      const id = b.runIds[0];
                      if (id) onSelect(id);
                    }}
                  >
                    <strong>{b.label}</strong> <span>{b.count}</span>
                  </button>
                ))}
              </>
            ) : null}
          </div>
          <div className="runs-write">
            <button type="button" className="btn primary" disabled={busy} onClick={onWriteBlog}>
              Write blog
            </button>
          </div>
          <p className="hint runs-rail-hint">
            Select a run to open it. Templates live under Settings.
          </p>
          <ul id="run-list">
            {!runs.length ? (
              <li className="empty">No runs yet.</li>
            ) : (
              runs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`run-select-btn ${r.id === selectedId ? "active" : ""}`}
                    onClick={() => onSelect(r.id)}
                  >
                    <span className="topic">{r.topic || r.brief?.topic}</span>
                    <span className="meta">
                      <span className={`status ${statusClass(r.status)}`}>{r.status}</span>
                      {r.autoAccepted ? <span className="retryable-badge">auto</span> : null}
                      <span>{r.id}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="run-delete-btn"
                    title="Delete run"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Are you sure you want to delete this run?")) onDelete(r.id);
                    }}
                  >
                    🗑️
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>
        <div className="runs-detail">
          {selectedId ? (
            <button
              type="button"
              className="runs-back"
              onClick={() => onSelect(null)}
            >
              ← Runs
            </button>
          ) : null}
          <RunDetail
            run={run}
            templates={props.templates}
            tab={props.tab}
            busy={busy}
            hasGeminiKey={props.hasGeminiKey}
            generateImages={props.generateImages}
            progress={props.progress}
            onTab={props.onTab}
            onAct={props.onAct}
            onGenerateImagesChange={props.onGenerateImagesChange}
            onRunUpdated={props.onRunUpdated}
            toast={props.toast}
          />
        </div>
      </div>
    </section>
  );
}
