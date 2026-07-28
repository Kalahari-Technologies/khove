import http from "http";
import { env } from "@backend/env";
import { createApp } from "@backend/app";
import { initRealtime } from "@backend/realtime/io";

const app = createApp();
const server = http.createServer(app);

// socket.io realtime gateway shares the HTTP server.
initRealtime(server);

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[khove_backend] listening on :${env.PORT} (frontend: ${env.FRONTEND_ORIGIN})`);
});
