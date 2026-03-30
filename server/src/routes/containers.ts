import { Router } from "express";
import { z } from "zod";
import { DockerBackend } from "../types";

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

export function createContainersRouter(backend: DockerBackend) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      response.json(await backend.listContainers());
    } catch (error) {
      next(error);
    }
  });

  router.post("/run", async (request, response, next) => {
    try {
      response.status(201).json(await backend.runContainer(runContainerSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/start", async (request, response, next) => {
    try {
      response.json(await backend.startContainer(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/stop", async (request, response, next) => {
    try {
      response.json(await backend.stopContainer(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/restart", async (request, response, next) => {
    try {
      response.json(await backend.restartContainer(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      await backend.removeContainer(request.params.id);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/compose/:project/start", async (request, response, next) => {
    try {
      const { project } = composeProjectSchema.parse(request.params);
      await backend.startComposeProject(project);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/compose/:project/stop", async (request, response, next) => {
    try {
      const { project } = composeProjectSchema.parse(request.params);
      await backend.stopComposeProject(project);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.delete("/compose/:project", async (request, response, next) => {
    try {
      const { project } = composeProjectSchema.parse(request.params);
      await backend.removeComposeProject(project);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
