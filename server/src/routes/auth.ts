import { Router } from "express";
import { z } from "zod";
import { DockLiteAuth } from "../auth/middleware";
import { hashPassword, verifyPassword } from "../auth/password";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const updateCredentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export function createAuthRouter(auth: DockLiteAuth) {
  const router = Router();

  router.get("/session", async (request, response, next) => {
    try {
      response.json(await auth.buildSessionState(await auth.resolveExpressRequest(request)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", async (request, response, next) => {
    try {
      const resolved = await auth.resolveExpressRequest(request);
      const payload = loginSchema.parse(request.body);

      if (
        payload.username !== resolved.config.adminUsername ||
        !(await verifyPassword(resolved.config.adminPasswordHash, payload.password))
      ) {
        response.status(401).json({
          error: {
            code: "invalid_credentials",
            message: "The admin username or password is incorrect",
          },
        });
        return;
      }

      response.json(auth.issueAuthResponse(resolved.config));
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", (_request, response) => {
    response.status(204).send();
  });

  router.get("/config", auth.requireAuth(), async (request, response, next) => {
    try {
      const resolved = request.dockliteAuth ?? await auth.resolveExpressRequest(request);
      response.json(auth.getConfigView(resolved.config));
    } catch (error) {
      next(error);
    }
  });

  router.post("/credentials", auth.requireAuth(), async (request, response, next) => {
    try {
      const resolved = request.dockliteAuth ?? await auth.resolveExpressRequest(request);
      const payload = updateCredentialsSchema.parse(request.body);
      const nextConfig = await auth.configStore.write({
        ...resolved.config,
        adminUsername: payload.username.trim(),
        adminPasswordHash: await hashPassword(payload.password),
        authVersion: resolved.config.authVersion + 1,
        defaultCredentialsActive: false,
      });

      response.json(auth.issueAuthResponse(nextConfig));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
