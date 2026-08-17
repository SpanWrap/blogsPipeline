/**
 * Single Vercel Function entry. Default export must be a function.
 * vercel.json rewrites all routes here (UI + API).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createUiServer } from "../src/server/index";

export const maxDuration = 300;

const server = createUiServer();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  server.emit("request", req, res);
}
