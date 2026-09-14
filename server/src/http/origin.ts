import type { RequestHandler } from "express";
import { BackendError } from "../types";

// The split-port dev setup: Vite on :8080 calling the API on :9001.
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** CORS allowlist. An absent Origin is a non-browser request, which CORS ignores. */
export function isLoopbackOrigin(origin?: string) {
  return !origin || LOOPBACK_ORIGIN.test(origin);
}

/**
 * Trust gate for state-changing requests, including the WebSocket upgrade.
 * CORS does not cover either case: WebSockets are exempt from it entirely, and
 * a body-less POST is a "simple" request that crosses origins with no preflight.
 *
 * Accepted when:
 *  - Origin is absent — browsers always send it on POST and on a WS handshake,
 *    so this is a non-browser client (curl), which is not a CSRF vector.
 *  - Origin's host:port equals the request's own Host — this is what keeps
 *    remote/sameOriginMode working, where the legitimate origin is the LAN IP.
 *  - Origin is loopback — the split-port dev setup.
 */
export function isTrustedOrigin(origin?: string, host?: string) {
  if (!origin) {
    return true;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // Opaque origins ("null" from a sandboxed iframe or file://) land here.
    return false;
  }

  return originHost === host?.toLowerCase() || LOOPBACK_ORIGIN.test(origin);
}

/** Mounted on /api regardless of sameOriginMode — CORS is not mounted there. */
export const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
  if (
    !STATE_CHANGING_METHODS.has(request.method) ||
    isTrustedOrigin(request.headers.origin, request.headers.host)
  ) {
    next();
    return;
  }

  next(new BackendError(403, "forbidden_origin", "Request origin is not allowed by DockLite"));
};
