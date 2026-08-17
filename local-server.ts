/**
 * Local review UI (CLI: npm run ui).
 * Not named server.ts so Vercel does not treat this as the production entrypoint.
 */
import { startUiServer } from "./src/ui-server/index";

startUiServer();
