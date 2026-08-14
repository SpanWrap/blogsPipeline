/**
 * Vercel detects this file by name and by a top-level server.listen() / default export.
 */
import { createUiServer } from "./src/server/index";

export const maxDuration = 300;

const server = createUiServer();
server.listen(Number(process.env.PORT ?? 8787));

export default server;
