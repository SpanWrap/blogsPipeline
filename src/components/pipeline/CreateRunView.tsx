"use client";

import { FormEvent, useRef, useState } from "react";
import { StylePreset, TemplateRecord } from "./types";

type CreateRunViewProps = {
  templates: TemplateRecord[];
  stylePresets: StylePreset[];
  lastStylePresetId?: string;
  busy: boolean;
  onCreate: (brief: Record<string, string | string[] | null>, andRun: boolean) => void;
  onBatch: (topics: string[], templateId: string | null, stylePresetId: string | null) => void;
};

export function CreateRunView({
  templates,
  stylePresets,
  lastStylePresetId,
  busy,
  onCreate,
  onBatch,
}: CreateRunViewProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [batchTopics, setBatchTopics] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [stylePresetId, setStylePresetId] = useState(lastStylePresetId || "");

  function formBrief(form: HTMLFormElement) {
    const fd = new FormData(form);
    const sourceUrl = String(fd.get("sourceUrl") || "").trim();
    return {
      topic: String(fd.get("topic") || "").trim(),
      targetAudience: String(fd.get("targetAudience") || "").trim(),
      tone: String(fd.get("tone") || "").trim(),
      keywords: String(fd.get("keywords") || ""),
      templateId: String(fd.get("templateId") || "") || null,
      stylePresetId: String(fd.get("stylePresetId") || "") || null,
      sourceUrl: sourceUrl || null,
      referenceUrls: sourceUrl ? [sourceUrl] : [],
    };
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onCreate(formBrief(e.currentTarget), false);
  }

  return (
    <section className="home-pane">
      <h2>New run</h2>
      <form ref={formRef} className="form-grid" onSubmit={onSubmit}>
        <label className="full">
          Source blog URL (optional)
          <input
            name="sourceUrl"
            type="url"
            placeholder="https://www.educative.io/courses/.../how-the-domain-name-system-works"
          />
        </label>
        <p className="hint full">
          Paste another article URL to ground the run. We fetch that page, use it as a primary
          source with your template, and generate a new post. You can also paste the URL in Topic.
        </p>
        <label>
          Topic
          <input
            name="topic"
            placeholder="AI agents in customer support — or paste a blog URL"
          />
        </label>
        <label>
          Audience
          <input name="targetAudience" defaultValue="startup founders" />
        </label>
        <label>
          Tone
          <input name="tone" defaultValue="technical but easy to understand" />
        </label>
        <label>
          Keywords (comma-separated)
          <input name="keywords" placeholder="AI agents, customer support" />
        </label>
        <label>
          Style lock
          <select
            name="stylePresetId"
            value={stylePresetId}
            onChange={(e) => setStylePresetId(e.target.value)}
          >
            <option value="">Default (use tone field)</option>
            {stylePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          Article template (sections + instructions)
          <select
            name="templateId"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">None (default structure)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            Create run
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              if (formRef.current) onCreate(formBrief(formRef.current), true);
            }}
          >
            Create & run to review
          </button>
        </div>
      </form>
      <div className="batch-box">
        <h3>Batch Run to review</h3>
        <p className="hint">
          One topic per line (max 8). Creates runs through outline for live draft later.
        </p>
        <textarea
          rows={4}
          placeholder={"AI agents in support\nLLM eval harnesses\nRAG failure modes"}
          value={batchTopics}
          onChange={(e) => setBatchTopics(e.target.value)}
        />
        <div className="form-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              onBatch(
                batchTopics
                  .split("\n")
                  .map((t) => t.trim())
                  .filter((t) => t.length >= 3)
                  .slice(0, 8),
                templateId || null,
                stylePresetId || null,
              )
            }
          >
            Batch create → outline
          </button>
        </div>
      </div>
    </section>
  );
}
