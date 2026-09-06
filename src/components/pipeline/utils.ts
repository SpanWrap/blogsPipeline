export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export function statusClass(status: string): string {
  if (["PUBLISHED", "APPROVED"].includes(status)) return "ok";
  if (["FAILED", "PUBLISH_FAILED", "CANCELLED"].includes(status)) return "bad";
  if (["REVIEW_REQUIRED", "QUALITY_CHECK", "DRAFT_READY"].includes(status)) return "warn";
  return "";
}

const IN_FLIGHT = new Set(["RESEARCHING", "GENERATING", "QUALITY_CHECK"]);

/** True while the server is still working on a run (survives refresh via polling). */
export function isInFlightRun(run: unknown): boolean {
  if (!run || typeof run !== "object") return false;
  const r = run as { status?: string; stages?: { status?: string }[] };
  if (IN_FLIGHT.has(String(r.status || ""))) return true;
  return Boolean(r.stages?.some((s) => s.status === "running"));
}

export function activityLabel(action: unknown): string {
  return String(action || "").replace(/_/g, " ");
}
