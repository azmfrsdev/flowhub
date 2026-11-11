import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { MAX_FRAME_BYTES, handleConnection } from "./session";

/**
 * `flowhub-live`, the rehearsal relay (ADR-0017 D1). A small Node server, not
 * Next.js, because App Router routes can't take a WebSocket upgrade. It serves
 * one WebSocket path, `/rehearse`, and a health check on `/`.
 *
 *   npm run live          locally, on port 8081 (reads .env.local)
 *   npm run deploy:live   to Cloud Run
 *
 * Only pages from the app's own origin may connect (LIVE_ALLOWED_ORIGINS, a
 * list separated by commas or semicolons; APP_BASE_URL by default).
 */

const port = Number(process.env.PORT ?? 8081);
const allowed = new Set(
  (process.env.LIVE_ALLOWED_ORIGINS ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
    .split(/[,;]/)
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

const server = createServer((req, res) => {
  res.writeHead(req.url === "/" ? 200 : 404, { "content-type": "text/plain" });
  res.end(req.url === "/" ? "ok" : "not found");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

server.on("upgrade", (req, socket, head) => {
  const origin = (req.headers.origin ?? "").replace(/\/$/, "");
  if (new URL(req.url ?? "/", "http://relay").pathname !== "/rehearse" || !allowed.has(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws));
});

server.listen(port, () => console.log(`[live] relay listening on ${port}; origins: ${[...allowed].join(", ")}`));

// Cloud Run sends SIGTERM before stopping an instance: stop taking new calls and let open ones end.
process.on("SIGTERM", () => {
  server.close();
  for (const client of wss.clients) client.close(1001, "restarting");
});
