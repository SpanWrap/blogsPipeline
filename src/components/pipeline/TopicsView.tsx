"use client";

import { DigestData, DigestItem } from "./types";
import { formatWhen } from "./utils";

const SOURCE_ICONS: Record<string, string> = {
  github:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>',
  reddit:
    '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M16.5 10.2a1.5 1.5 0 0 0-2.55-1.07 7.4 7.4 0 0 0-3.7-1.17l.63-3 2.05.44a1.2 1.2 0 1 0 .12-.56l-2.3-.5a.5.5 0 0 0-.58.38l-.72 3.4a7.4 7.4 0 0 0-3.82 1.18 1.5 1.5 0 1 0-1.66 2.4c-.05.28-.08.56-.08.85 0 2.43 2.83 4.4 6.31 4.4s6.31-1.97 6.31-4.4c0-.27-.03-.54-.07-.8a1.5 1.5 0 0 0 .96-1.38Z"/></svg>',
  x: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12.6.75h2.45l-5.36 6.13L16 15.25h-4.94L7.6 10.14 3.16 15.25H.7l5.73-6.55L0 .75h5.06l3.4 4.6L12.6.75Zm-.86 13.07h1.36L4.32 2.13H2.86l8.88 11.69Z"/></svg>',
  hackernews:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#ff6600"/><path fill="#fff" d="M4.4 3.2h2.1l1.5 3.1 1.5-3.1h2.1L8.9 8.1V12.8H7.1V8.1L4.4 3.2Z"/></svg>',
  arxiv:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#b31b1b"/><path fill="#fff" d="M4 4.2h8v1.4H5.7V7.4h5.6v1.3H5.7v3.1H4V4.2Z"/></svg>',
  huggingface:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#ffd21e" stroke="#1c1915" stroke-width="1"/><circle cx="5.6" cy="6.6" r="1.1" fill="#1c1915"/><circle cx="10.4" cy="6.6" r="1.1" fill="#1c1915"/><path d="M5.2 10c.8 1.3 4.8 1.3 5.6 0" fill="none" stroke="#1c1915" stroke-width="1.2" stroke-linecap="round"/></svg>',
  lobsters:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#ac130d"/><text x="3" y="12" fill="#fff" font-size="9" font-weight="700" font-family="ui-sans-serif,system-ui">L</text></svg>',
  news: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2 2.5h9.5A2.5 2.5 0 0 1 14 5v8.5H4.5A2.5 2.5 0 0 1 2 11V2.5Zm1.5 1.5v7A1 1 0 0 0 4.5 12H12.5V5A1 1 0 0 0 11.5 4H3.5ZM5 6h6v1.2H5V6Zm0 2.2h6V9.4H5V8.2Z"/></svg>',
  devto:
    '<svg viewBox="0 0 32 16" width="22" height="14" aria-hidden="true"><text x="0" y="13" fill="currentColor" font-size="12" font-weight="700" font-family="ui-sans-serif,system-ui">DEV</text></svg>',
};

const LABELS: Record<string, string> = {
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

function digestScoreLabel(item: DigestItem): string {
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

function digestItems(digest: DigestData | null | "loading"): DigestItem[] {
  if (!digest || digest === "loading") return [];
  return [...(digest.github || []), ...(digest.reddit || []), ...(digest.x || []), ...(digest.more || [])];
}

type TopicsViewProps = {
  digest: DigestData | null | "loading";
  digestFilter: string;
  busy: boolean;
  onFilter: (id: string) => void;
  onRefresh: () => void;
  onWrite: (item: DigestItem) => void;
};

export function TopicsView({
  digest,
  digestFilter,
  busy,
  onFilter,
  onRefresh,
  onWrite,
}: TopicsViewProps) {
  const items = digestItems(digest);
  const counts: Record<string, number> = {};
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

  const activeFilter =
    digestFilter !== "all" && !chips.some((c) => c.id === digestFilter) ? "all" : digestFilter;
  const filtered =
    activeFilter === "all" ? items : items.filter((i) => i.platform === activeFilter);

  let updated = "Not loaded";
  if (digest === "loading") updated = "Loading feeds…";
  else if (digest?.generatedAt) updated = `Updated ${formatWhen(digest.generatedAt)}`;
  else if (digest) updated = "Ready";

  return (
    <section className="home-pane">
      <div className="panel-head">
        <div>
          <h2>Hot topics</h2>
          <p className="digest-updated">{updated}</p>
        </div>
        <button type="button" className="btn primary" disabled={busy} onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p className="hint">
        GitHub trending, Reddit, Hacker News, arXiv, Hugging Face, Lobsters, and AI press. Filter by
        source, then <strong>Write this</strong> to start a run.
      </p>
      <div className="source-filters">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`source-filter ${activeFilter === c.id ? "active" : ""}`}
            onClick={() => onFilter(c.id)}
          >
            {c.label} · {c.count}
          </button>
        ))}
      </div>
      {digest && digest !== "loading" && digest.notes?.length ? (
        <p className="hint">{digest.notes.join(" ")}</p>
      ) : null}
      <ul className="topic-list">
        {digest === "loading" ? (
          <li className="empty">
            Loading GitHub, Reddit, HN, arXiv, Hugging Face, and tech press…
          </li>
        ) : !digest ? (
          <li className="empty">Could not load topics. Click Refresh to try again.</li>
        ) : filtered.length === 0 ? (
          <li className="empty">No topics for this source yet.</li>
        ) : (
          filtered.map((item, idx) => {
            const platform = item.platform || "";
            const label = LABELS[platform] || platform;
            return (
              <li key={`${item.url || item.title}-${idx}`} className="hot-item" data-platform={platform}>
                <div className="hot-item-head">
                  <a className="topic-title" href={item.url || "#"} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                  {SOURCE_ICONS[platform] ? (
                    <span
                      className="source-badge"
                      title={label}
                      aria-label={label}
                      dangerouslySetInnerHTML={{ __html: SOURCE_ICONS[platform] }}
                    />
                  ) : null}
                </div>
                {item.imageUrl ? (
                  <img
                    className="topic-thumb"
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <p className="hot-item-desc">{item.description || ""}</p>
                <div className="meta">
                  <span>{item.community || item.platform || ""}</span>
                  <span>{digestScoreLabel(item)}</span>
                </div>
                <div className="actions-row">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => onWrite(item)}
                  >
                    Write this
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
