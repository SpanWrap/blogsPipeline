/**
 * Vercel + local UI entrypoint.
 *
 * On Vercel (serverless): the default export is a (req, res) handler.
 * Locally: we call server.listen() for a traditional HTTP server.
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

/** Vercel-compatible request handler (default export). */
async function handler(req: IncomingMessage, res: ServerResponse) {
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
}

export default handler;

/* Local dev: start a listening server when NOT on Vercel. */
if (!process.env.VERCEL) {
  const server = createServer(handler);
  server.listen(Number(process.env.PORT ?? 8787));
}
