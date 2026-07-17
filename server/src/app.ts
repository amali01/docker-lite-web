import cors from "cors";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { DockLiteAuth } from "./auth/middleware";
import { createContainersRouter } from "./routes/containers";
import { createEngineRouter } from "./routes/engine";
import { createImagesRouter } from "./routes/images";
import { createLogsRouter } from "./routes/logs";
import { createNetworksRouter } from "./routes/networks";
import { createVolumesRouter } from "./routes/volumes";
import { BackendError } from "./types";
import { EngineManager } from "./engine-manager";
import { createAuthRouter } from "./routes/auth";

function isAllowedOrigin(origin?: string) {
  if (!origin) {
    return true;
  }

  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}

export interface CreateAppOptions {
  auth?: DockLiteAuth;
  sameOriginMode?: boolean;
  staticDir?: string | null;
  // Invoked after the /api/shutdown response has flushed, to stop the process.
  // Optional so tests (and any embedding without a lifecycle owner) can omit it.
  onShutdown?: () => void;
}

export function createApp(engine: EngineManager, options: CreateAppOptions = {}) {
  const app = express();
  const auth = options.auth ?? new DockLiteAuth();
  const sameOriginMode = options.sameOriginMode ?? false;
  const resolveBackend = () => engine.getActiveBackend();

  if (!sameOriginMode) {
    app.use(
      cors({
        origin(origin, callback) {
          if (isAllowedOrigin(origin)) {
            callback(null, true);
            return;
          }

          callback(new Error("Origin is not allowed by DockLite"));
        },
      }),
    );
  }

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api/auth", createAuthRouter(auth));
  app.use("/api/engine", auth.requireAuth(), createEngineRouter(engine));
  app.use("/api/containers", auth.requireAuth(), createContainersRouter(resolveBackend));
  app.use("/api/images", auth.requireAuth(), createImagesRouter(resolveBackend));
  app.use("/api/volumes", auth.requireAuth(), createVolumesRouter(resolveBackend));
  app.use("/api/networks", auth.requireAuth(), createNetworksRouter(resolveBackend));
  app.use("/api", createLogsRouter(resolveBackend, auth));

  // Quit the app: stop the background server on the user's request. Auth-gated —
  // any caller that can authenticate here already has full Docker control, so
  // stopping the GUI grants no extra power. dockerd is separate and unaffected.
  app.post("/api/shutdown", auth.requireAuth(), (_request, response) => {
    response.on("finish", () => options.onShutdown?.());
    response.status(202).json({ stopping: true });
  });

  const staticDir = options.staticDir ? resolve(options.staticDir) : null;
  const indexHtmlPath = staticDir ? resolve(staticDir, "index.html") : null;

  if (sameOriginMode && staticDir && indexHtmlPath && existsSync(indexHtmlPath)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api\/).*/, (_request, response) => {
      response.sendFile(indexHtmlPath);
    });
  }

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        error: {
          code: "invalid_request",
          message: "Request validation failed",
          details: error.issues.map((issue) => issue.message).join(", "),
        },
      });
      return;
    }

    if (error instanceof BackendError) {
      response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unexpected server error";

    response.status(500).json({
      error: {
        code: "internal_error",
        message,
      },
    });
  };

  app.use(errorHandler);

  return app;
}
