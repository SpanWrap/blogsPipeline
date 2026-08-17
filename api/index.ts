/** Minimal probe — replace with full handler once this returns 200. */
export default function handler(
  req: { url?: string; method?: string },
  res: {
    statusCode: number;
    setHeader: (k: string, v: string) => void;
    end: (b: string) => void;
  },
) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      message: "api/index is reachable",
      method: req.method ?? null,
      url: req.url ?? null,
    }),
  );
}

export const maxDuration = 300;
