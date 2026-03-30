import { Router } from "express";
import { z } from "zod";
import { DockerBackend } from "../types";

const createVolumeSchema = z.object({
  name: z.string().min(1),
});

export function createVolumesRouter(backend: DockerBackend) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      response.json(await backend.listVolumes());
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      response.status(201).json(await backend.createVolume(createVolumeSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:name", async (request, response, next) => {
    try {
      await backend.removeVolume(decodeURIComponent(request.params.name));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
