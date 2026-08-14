/**
 * Vercel + local UI entrypoint.
 * Vercel detects server.ts (project root) and captures server.listen().
 */
import { startUiServer } from "./src/server/index";

export const maxDuration = 300;

startUiServer();
