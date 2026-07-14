import { Router } from "express";
import { DockLiteAuth } from "../auth/middleware";
import { BackendResolver } from "../types";

export function createLogsRouter(resolveBackend: BackendResolver, auth: DockLiteAuth) {
  const router = Router();

  router.get("/containers/:id/logs/stream", async (request, response, next) => {
    try {
      const resolved = await auth.resolveExpressRequest(request);
      auth.assertResolvedRequest(resolved);
      request.dockliteAuth = resolved;

      const backend = await resolveBackend();

      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders();

      const unsubscribe = await backend.subscribeToContainerLogs(request.params.id, (chunk) => {
        response.write("event: log\n");
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        response.write(": heartbeat\n\n");
      }, 15000);

      request.on("close", async () => {
        clearInterval(heartbeat);
        await unsubscribe();
        response.end();
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
