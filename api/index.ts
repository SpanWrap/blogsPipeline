/**
 * Production entry for Vercel. Default export must be a function.
 * vercel.json rewrites all routes here.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server } from "node:http";

export const maxDuration = 300;

let serverPromise: Promise<Server> | null = null;

function getServer(): Promise<Server> {
  if (!serverPromise) {
    serverPromise = import("../src/ui-server/index")
      .then((m) => m.createUiServer())
      .catch((error) => {
        serverPromise = null;
        throw error;
      });
  }
  return serverPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const server = await getServer();
    server.emit("request", req, res);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("Pipeline API boot failure:", message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Pipeline boot failure", detail: message }));
    }
  }
}
