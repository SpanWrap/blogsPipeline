/**
 * Vercel Node handler for all /api/* routes.
 * Root public/ serves the review UI as static files.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createUiServer } from "../src/server/index";

export const maxDuration = 300;

const server = createUiServer();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  server.emit("request", req, res);
}
