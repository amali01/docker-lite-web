import { RawData, WebSocketServer } from "ws";
import { createServer } from "node:http";
import { createApp } from "./app";
import { config as loadEnv } from "dotenv";
import { EngineController } from "./engine-controller";

loadEnv({ path: "server/.env" });

const PORT = Number(process.env.DOCKLITE_PORT ?? 9001);
const HOST = process.env.DOCKLITE_HOST ?? "127.0.0.1";

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

async function main() {
  const backend = new EngineController();
  const app = createApp(backend);
  const server = createServer(app);

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const match = url.pathname.match(/^\/api\/containers\/([^/]+)\/exec$/);
    
    if (match) {
      const containerId = match[1];
      const cols = parseInt(url.searchParams.get('cols') || '80', 10);
      const rows = parseInt(url.searchParams.get('rows') || '24', 10);

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
                // ignore
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
    } else {
      socket.destroy();
    }
  });

  server.listen(PORT, HOST, async () => {
    const engine = await backend.getEngineInfo();
    const connection = engine.connected ? "connected" : `disconnected (${engine.errorMessage ?? "unknown error"})`;
    console.log(`DockLite backend listening on http://${HOST}:${PORT} - Docker ${connection}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
