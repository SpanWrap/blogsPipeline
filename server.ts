/**
 * Vercel + local UI entrypoint.
 * Vercel requires one of server.ts / app.ts / index.ts and a default export
 * that is a function or HTTP server, plus server.listen().
 */
import { createUiServer } from "./src/ui-server/index";

export const maxDuration = 300;

const server = createUiServer();

export default server;

server.listen(Number(process.env.PORT ?? 8787));
