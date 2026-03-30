import { Router } from "express";
import { z } from "zod";
import { DockerBackend, EngineSwitcher } from "../types";

const selectEngineSchema = z.object({
  targetId: z.string().min(1),
});

export function createEngineRouter(backend: DockerBackend & Partial<EngineSwitcher>) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      response.json(await backend.getEngineInfo());
    } catch (error) {
      next(error);
    }
  });

  router.get("/targets", async (_request, response, next) => {
    try {
      if (!backend.listTargets) {
        response.status(404).send();
        return;
      }
      response.json(await backend.listTargets());
    } catch (error) {
      next(error);
    }
  });

  router.post("/select", async (request, response, next) => {
    try {
      if (!backend.selectTarget) {
        response.status(404).send();
        return;
      }
      const payload = selectEngineSchema.parse(request.body);
      response.json(await backend.selectTarget(payload.targetId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
