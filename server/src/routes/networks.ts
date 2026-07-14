import { Router } from "express";
import { z } from "zod";
import { BackendResolver } from "../types";

const createNetworkSchema = z.object({
  name: z.string().min(1),
  driver: z.string().optional(),
});

export function createNetworksRouter(resolveBackend: BackendResolver) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.listNetworks());
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.status(201).json(await backend.createNetwork(createNetworkSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      await backend.removeNetwork(decodeURIComponent(request.params.id));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
