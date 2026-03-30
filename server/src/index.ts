import { createServer } from "node:http";
import { createApp } from "./app";
import { createDockerBackendFromEnv } from "./docker/client";

const PORT = Number(process.env.DOCKLITE_PORT ?? 9001);
const HOST = process.env.DOCKLITE_HOST ?? "127.0.0.1";

async function main() {
  const backend = await createDockerBackendFromEnv();
  const app = createApp(backend);
  const server = createServer(app);

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
