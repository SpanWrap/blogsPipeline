import type { GeneratedBlog } from "../models";

export type DiffHunk = {
  type: "same" | "add" | "del";
  text: string;
};

/** Line-level diff for review UI (Myers-lite LCS). */
export function diffArticles(before: string, after: string): DiffHunk[] {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? (dp[i + 1]![j + 1]! + 1) : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const hunks: DiffHunk[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      hunks.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      hunks.push({ type: "del", text: a[i]! });
      i++;
    } else {
      hunks.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) hunks.push({ type: "del", text: a[i++]! });
  while (j < m) hunks.push({ type: "add", text: b[j++]! });
  return hunks;
}

export function diffSummary(before: GeneratedBlog | null, after: GeneratedBlog | null): {
  changed: boolean;
  hunks: DiffHunk[];
  beforeTitle: string | null;
  afterTitle: string | null;
} {
  if (!before || !after) {
    return {
      changed: Boolean(after),
      hunks: after ? [{ type: "add", text: after.content }] : [],
      beforeTitle: before?.title ?? null,
      afterTitle: after?.title ?? null,
    };
  }
  const hunks = diffArticles(before.content, after.content);
  const changed =
    before.title !== after.title ||
    before.excerpt !== after.excerpt ||
    hunks.some((h) => h.type !== "same");
  return { changed, hunks, beforeTitle: before.title, afterTitle: after.title };
}
