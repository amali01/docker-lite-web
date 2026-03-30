import { Router } from "express";
import { DockerBackend } from "../types";

export function createEngineRouter(backend: DockerBackend) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      response.json(await backend.getEngineInfo());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
