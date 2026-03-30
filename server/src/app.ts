import cors from "cors";
import express, { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { createContainersRouter } from "./routes/containers";
import { createEngineRouter } from "./routes/engine";
import { createImagesRouter } from "./routes/images";
import { createLogsRouter } from "./routes/logs";
import { createNetworksRouter } from "./routes/networks";
import { createVolumesRouter } from "./routes/volumes";
import { BackendError, DockerBackend } from "./types";

function isAllowedOrigin(origin?: string) {
  if (!origin) {
    return true;
  }

  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}

export function createApp(backend: DockerBackend) {
  const app = express();

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
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api/engine", createEngineRouter(backend));
  app.use("/api/containers", createContainersRouter(backend));
  app.use("/api/images", createImagesRouter(backend));
  app.use("/api/volumes", createVolumesRouter(backend));
  app.use("/api/networks", createNetworksRouter(backend));
  app.use("/api", createLogsRouter(backend));

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
