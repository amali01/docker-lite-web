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

      let cleaned = false;
      let heartbeat: NodeJS.Timeout | null = null;
      let unsubscribe: (() => void) | null = null;

      // Registered before the subscribe await below: if the client aborts
      // while we're still waiting on the backend, this still fires and tears
      // down whatever has been set up so far.
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        if (!response.writableEnded) response.end();
      };

      request.on("close", cleanup);

      const subscribed = await backend.subscribeToContainerLogs(request.params.id, (chunk) => {
        response.write("event: log\n");
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      });

      // The client may have already aborted while the await above was in
      // flight (the "close" event fires only once, before this code resumes)
      // or the socket may already be gone without the event having fired yet.
      // Either way, the subscription and heartbeat below must not outlive it.
      if (cleaned || request.destroyed) {
        subscribed();
        return;
      }

      unsubscribe = subscribed;
      heartbeat = setInterval(() => {
        response.write(": heartbeat\n\n");
      }, 15000);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
