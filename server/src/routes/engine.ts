import { Router } from "express";
import { z } from "zod";
import { DockerBackend, EngineSwitcher, EngineTargetManager } from "../types";

const selectEngineSchema = z.object({
  targetId: z.string().min(1),
});

const createTargetSchema = z.union([
  z
    .object({
      kind: z.literal("local"),
      label: z.string().trim().min(1),
      socketPath: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ssh"),
      label: z.string().trim().min(1),
      host: z.string().trim().min(1),
      port: z.number().int().positive(),
      username: z.string().trim().min(1),
      authMode: z.union([z.literal("agent"), z.literal("keyFile")]),
      keyPath: z.string().trim().min(1).nullable().optional(),
      knownHostsPath: z.string().trim().min(1).nullable().optional(),
      dockerHostOverride: z.string().trim().min(1).nullable().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tcpTls"),
      label: z.string().trim().min(1),
      host: z.string().trim().min(1),
      port: z.number().int().positive(),
      serverName: z.string().trim().min(1).nullable().optional(),
      tlsMode: z.union([z.literal("serverOnly"), z.literal("mtls")]),
      caPath: z.string().trim().min(1).nullable().optional(),
      certPath: z.string().trim().min(1).nullable().optional(),
      keyPath: z.string().trim().min(1).nullable().optional(),
    })
    .strict(),
]);

const updateTargetSchema = z.union([
  z
    .object({
      kind: z.literal("local"),
      label: z.string().trim().min(1).optional(),
      socketPath: z.string().trim().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ssh"),
      label: z.string().trim().min(1).optional(),
      host: z.string().trim().min(1).optional(),
      port: z.number().int().positive().optional(),
      username: z.string().trim().min(1).optional(),
      authMode: z.union([z.literal("agent"), z.literal("keyFile")]).optional(),
      keyPath: z.string().trim().min(1).nullable().optional(),
      knownHostsPath: z.string().trim().min(1).nullable().optional(),
      dockerHostOverride: z.string().trim().min(1).nullable().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tcpTls"),
      label: z.string().trim().min(1).optional(),
      host: z.string().trim().min(1).optional(),
      port: z.number().int().positive().optional(),
      serverName: z.string().trim().min(1).nullable().optional(),
      tlsMode: z.union([z.literal("serverOnly"), z.literal("mtls")]).optional(),
      caPath: z.string().trim().min(1).nullable().optional(),
      certPath: z.string().trim().min(1).nullable().optional(),
      keyPath: z.string().trim().min(1).nullable().optional(),
    })
    .strict(),
]);

export function createEngineRouter(backend: DockerBackend & EngineSwitcher & EngineTargetManager) {
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
      response.json(await backend.listTargets());
    } catch (error) {
      next(error);
    }
  });

  router.post("/targets", async (request, response, next) => {
    try {
      const payload = createTargetSchema.parse(request.body);
      response.status(201).json(await backend.createTarget(payload));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/targets/:id", async (request, response, next) => {
    try {
      const payload = updateTargetSchema.parse(request.body);
      response.json(await backend.updateTarget(request.params.id, payload));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/targets/:id", async (request, response, next) => {
    try {
      await backend.deleteTarget(request.params.id);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/targets/test", async (request, response, next) => {
    try {
      const payload = createTargetSchema.parse(request.body);
      response.json(await backend.testTarget(payload));
    } catch (error) {
      next(error);
    }
  });

  router.post("/targets/:id/test", async (request, response, next) => {
    try {
      response.json(await backend.retestTarget(request.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/select", async (request, response, next) => {
    try {
      const payload = selectEngineSchema.parse(request.body);
      response.json(await backend.selectTarget(payload.targetId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
