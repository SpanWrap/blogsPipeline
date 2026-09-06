/** Soft route placeholder — avoid a full-page takeover during client navigations. */
export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="route-loading-dot" aria-hidden="true" />
      <span className="muted">Loading…</span>
    </div>
  );
}
