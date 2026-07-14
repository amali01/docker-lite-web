import { Router } from "express";
import { z } from "zod";
import { BackendResolver } from "../types";

const runContainerSchema = z.object({
  image: z.string().min(1),
  name: z.string().optional(),
  ports: z.array(
    z.object({
      host: z.string(),
      container: z.string(),
      protocol: z.enum(["tcp", "udp"]).optional(),
    }),
  ),
  envVars: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    }),
  ),
  volumes: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      readOnly: z.boolean().optional(),
    }),
  ),
});

const composeProjectSchema = z.object({
  project: z.string().min(1),
});

export function createContainersRouter(resolveBackend: BackendResolver) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.listContainers());
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.getContainerDetails(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/inspect", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.getContainerInspect(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/stats", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.getContainerStats(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/run", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.status(201).json(await backend.runContainer(runContainerSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/start", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.startContainer(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/stop", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.stopContainer(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/rebuild", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.rebuildContainer(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/restart", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      response.json(await backend.restartContainer(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      await backend.removeContainer(request.params.id);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/compose/:project/start", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      const { project } = composeProjectSchema.parse(request.params);
      await backend.startComposeProject(project);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/compose/:project/stop", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      const { project } = composeProjectSchema.parse(request.params);
      await backend.stopComposeProject(project);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.delete("/compose/:project", async (request, response, next) => {
    try {
      const backend = await resolveBackend();
      const { project } = composeProjectSchema.parse(request.params);
      await backend.removeComposeProject(project);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
