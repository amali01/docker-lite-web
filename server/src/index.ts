import { RawData, WebSocketServer } from "ws";
import { createServer as createHttpServer } from "node:http";
import { config as loadEnv } from "dotenv";
import type { Duplex } from "node:stream";
import { createApp } from "./app";
import { EngineController } from "./engine-controller";
import { AuthConfigStore, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "./auth/config";
import { DockLiteAuth } from "./auth/middleware";
import { getRuntimeConfig } from "./runtime/config";
import { BackendError } from "./types";

loadEnv({ path: "server/.env" });

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function rawDataToBuffer(data: RawData) {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  }

  return Buffer.from(data);
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusCode === 401 ? "Unauthorized" : "Forbidden"}\r\n` +
    "Connection: close\r\n" +
    "Content-Type: text/plain\r\n\r\n" +
    `${message}`,
  );
  socket.destroy();
}

async function main() {
  const backend = new EngineController();
  const authConfigStore = new AuthConfigStore();
  const authConfig = await authConfigStore.read();
  const runtimeConfig = getRuntimeConfig();
  const auth = new DockLiteAuth({
    configStore: authConfigStore,
  });
  const app = createApp(backend, {
    auth,
    sameOriginMode: runtimeConfig.sameOriginMode,
    staticDir: runtimeConfig.staticDir,
  });
  const server = createHttpServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const match = url.pathname.match(/^\/api\/containers\/([^/]+)\/exec$/);

    if (!match) {
      socket.destroy();
      return;
    }

    try {
      const resolved = await auth.resolveNodeRequest(request);
      auth.assertResolvedRequest(resolved);

      const containerId = match[1];
      const cols = parseInt(url.searchParams.get("cols") || "80", 10);
      const rows = parseInt(url.searchParams.get("rows") || "24", 10);

      wss.handleUpgrade(request, socket, head, async (ws) => {
        try {
          const { stream, exec } = await backend.execContainer(containerId, cols, rows);

          ws.on("message", (msg: RawData) => {
            const text = typeof msg === "string" ? msg : rawDataToBuffer(msg).toString("utf8");

            if (text) {
              try {
                const payload = JSON.parse(text);
                if (payload.type === "resize") {
                  exec.resize({ w: payload.cols, h: payload.rows }).catch(() => {});
                  return;
                }
              } catch {
                // ignore resize parse errors and pass raw data through
              }
            }
            stream.write(rawDataToBuffer(msg));
          });

          stream.on("data", (chunk: Buffer) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(chunk);
            }
          });

          stream.on("end", () => {
            ws.close();
          });

          ws.on("close", () => {
            stream.end();
          });
        } catch (error) {
          console.error("Exec error", error);
          if (ws.readyState === ws.OPEN) {
            ws.send(`\r\n\x1b[31m[ERROR] Failed to start terminal: ${getErrorMessage(error)}\x1b[0m\r\n`);
          }
          ws.close();
        }
      });
    } catch (error) {
      const message = error instanceof BackendError ? error.message : "WebSocket upgrade rejected";
      const statusCode = error instanceof BackendError ? error.status : 403;
      rejectUpgrade(socket, statusCode, message);
    }
  });

  server.listen(runtimeConfig.port, runtimeConfig.host, async () => {
    const engine = await backend.getEngineInfo();
    const connection = engine.connected ? "connected" : `disconnected (${engine.errorMessage ?? "unknown error"})`;
    console.log(`DockLite backend listening on http://${runtimeConfig.host}:${runtimeConfig.port} - Docker ${connection}`);
    if (authConfig.defaultCredentialsActive) {
      console.log(`Default admin credentials are active: ${DEFAULT_ADMIN_USERNAME} / ${DEFAULT_ADMIN_PASSWORD}`);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
