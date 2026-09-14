import { Router } from "express";
import { z } from "zod";
import { DockLiteAuth } from "../auth/middleware";
import { hashPassword, verifyPassword } from "../auth/password";
import { BackendError } from "../types";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const updateCredentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const loginRequiredSchema = z.object({
  required: z.boolean(),
});

const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_THROTTLE_MAX_KEYS = 1_000;

interface LoginAttempts {
  failures: number;
  resetAt: number;
}

/**
 * Windowed per-IP cap on failed logins: argon2 alone is not a brute-force
 * barrier once DOCKLITE_REMOTE_ENABLED is on. A successful login clears the
 * counter, and the window always expires, so the only admin is never locked
 * out permanently.
 *
 * ponytail: in-memory Map — single process only, and it forgets everything on
 * restart. Move to a shared store (Redis/SQLite) if DockLite ever runs more
 * than one instance behind a load balancer. The size cap below is a crude
 * guard against an attacker growing the map by rotating source IPs.
 */
function createLoginThrottle(now: () => number = Date.now) {
  const attempts = new Map<string, LoginAttempts>();

  return {
    retryAfterSeconds(key: string): number | null {
      const entry = attempts.get(key);

      if (!entry || entry.resetAt <= now()) {
        attempts.delete(key);
        return null;
      }

      return entry.failures >= LOGIN_MAX_FAILURES ? Math.ceil((entry.resetAt - now()) / 1000) : null;
    },
    recordFailure(key: string): void {
      const existing = attempts.get(key);
      const entry = existing && existing.resetAt > now() ? existing : { failures: 0, resetAt: now() + LOGIN_WINDOW_MS };

      entry.failures += 1;
      attempts.set(key, entry);

      if (attempts.size > LOGIN_THROTTLE_MAX_KEYS) {
        for (const [candidate, value] of attempts) {
          if (value.resetAt <= now()) {
            attempts.delete(candidate);
          }
        }
      }
    },
    reset(key: string): void {
      attempts.delete(key);
    },
  };
}

export function createAuthRouter(auth: DockLiteAuth) {
  const router = Router();
  const loginThrottle = createLoginThrottle();

  router.get("/session", async (request, response, next) => {
    try {
      response.json(await auth.buildSessionState(await auth.resolveExpressRequest(request)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", async (request, response, next) => {
    try {
      const clientKey = request.ip ?? request.socket.remoteAddress ?? "unknown";
      const retryAfter = loginThrottle.retryAfterSeconds(clientKey);

      if (retryAfter !== null) {
        response.status(429).set("Retry-After", String(retryAfter)).json({
          error: {
            code: "too_many_login_attempts",
            message: `Too many failed sign-in attempts. Try again in ${retryAfter} second(s).`,
          },
        });
        return;
      }

      const resolved = await auth.resolveExpressRequest(request);
      const payload = loginSchema.parse(request.body);

      if (
        payload.username !== resolved.config.adminUsername ||
        !(await verifyPassword(resolved.config.adminPasswordHash, payload.password))
      ) {
        loginThrottle.recordFailure(clientKey);
        response.status(401).json({
          error: {
            code: "invalid_credentials",
            message: "The admin username or password is incorrect",
          },
        });
        return;
      }

      loginThrottle.reset(clientKey);
      response.json(auth.issueAuthResponse(resolved.config));
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", (_request, response) => {
    response.status(204).send();
  });

  // EventSource and WebSocket cannot send an Authorization header, so a stream
  // is opened with a ticket from here instead of with the bearer token. One
  // ticket per connection attempt — reconnects must come back for a new one.
  router.post("/stream-ticket", auth.requireAuth(), async (request, response, next) => {
    try {
      const resolved = request.dockliteAuth ?? await auth.resolveExpressRequest(request);
      response.json(auth.issueStreamTicket(resolved.config));
    } catch (error) {
      next(error);
    }
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

  router.post("/login-required", auth.requireAuth(), async (request, response, next) => {
    try {
      const resolved = request.dockliteAuth ?? await auth.resolveExpressRequest(request);
      const { required } = loginRequiredSchema.parse(request.body);

      if (!required && !auth.allowAuthBypass) {
        throw new BackendError(
          400,
          "login_required_locked",
          "Login can't be disabled while DockLite is reachable over the network.",
        );
      }

      const nextConfig = await auth.configStore.write({
        ...resolved.config,
        loginRequired: required,
        // Re-enabling login revokes every existing token so a fresh sign-in is
        // required; disabling leaves tokens alone (bypass is active anyway).
        authVersion: required ? resolved.config.authVersion + 1 : resolved.config.authVersion,
      });

      response.json(auth.getConfigView(nextConfig));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
