import { Router } from "express";
import { z } from "zod";
import { BackendResolver } from "../types";

const pullImageSchema = z.object({
  image: z.string().min(1),
});

export function createImagesRouter(resolveBackend: BackendResolver) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.listImages());
    } catch (error) {
      next(error);
    }
  });

  router.post("/pull", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.status(201).json(await backend.pullImage(pullImageSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      await backend.removeImage(decodeURIComponent(request.params.id));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
