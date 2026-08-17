/**
 * Vercel + local UI entrypoint.
 *
 * Vercel detects this file by name and by a top-level server.listen().
 * Do NOT default-export the http.Server — Vercel would invoke the object as a
 * (req, res) handler and return INTERNAL_FUNCTION_INVOCATION_FAILED.
 * Do NOT list this file under vercel.json "functions" (that glob is for /api).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Server } from "node:http";

export const maxDuration = 300;

let innerPromise: Promise<Server> | null = null;

function getInner(): Promise<Server> {
  if (!innerPromise) {
    innerPromise = import("./src/ui-server/index")
      .then((m) => m.createUiServer())
      .catch((error) => {
        innerPromise = null;
        throw error;
      });
  }
  return innerPromise;
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    try {
      const ui = await getInner();
      ui.emit("request", req, res);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error("Pipeline boot failure:", message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(`Pipeline boot failure\n\n${message}`);
      }
    }
  })();
});

server.listen(Number(process.env.PORT ?? 8787));
