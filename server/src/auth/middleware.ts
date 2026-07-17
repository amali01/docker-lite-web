import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { NextFunction, Request, RequestHandler } from "express";
import type { AuthConfigView, AuthSessionState } from "../../../src/lib/api/types";
import { BackendError } from "../types";
import { AuthConfigStore } from "./config";
import { createAuthToken, verifyAuthToken } from "./token";
import type { AuthConfig } from "./types";

export interface DockLiteAuthOptions {
  configStore?: AuthConfigStore;
  // Whether a persisted `loginRequired: false` may actually disable auth. Only
  // true on a loopback-bound server. Defaults false so auth is never bypassed
  // unless a caller explicitly opts in for a verified-local instance.
  allowAuthBypass?: boolean;
}

// Sentinel expiry for the synthetic identity used when login is disabled: there
// is no token, so it never expires. Kept out of Date/now to stay deterministic.
const NEVER_EXPIRES = "9999-12-31T23:59:59.000Z";

export interface AuthIdentity {
  username: string;
  expiresAt: string;
}

export interface ResolvedAuthRequest {
  config: AuthConfig;
  token: string | null;
  identity: AuthIdentity | null;
}

declare module "express-serve-static-core" {
  interface Request {
    dockliteAuth?: ResolvedAuthRequest;
  }
}

function getHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getBearerToken(headers: IncomingHttpHeaders) {
  const header = getHeader(headers, "authorization");

  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function getTokenFromUrl(url: string | undefined, hostHeader: string | undefined) {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url, `http://${hostHeader ?? "127.0.0.1"}`);
    return parsedUrl.searchParams.get("access_token");
  } catch {
    return null;
  }
}

export class DockLiteAuth {
  readonly configStore: AuthConfigStore;
  readonly allowAuthBypass: boolean;

  constructor(options: DockLiteAuthOptions = {}) {
    this.configStore = options.configStore ?? new AuthConfigStore();
    this.allowAuthBypass = options.allowAuthBypass ?? false;
  }

  async resolveExpressRequest(request: Request): Promise<ResolvedAuthRequest> {
    return this.resolveRequest(request.headers, request.originalUrl || request.url);
  }

  async resolveNodeRequest(request: IncomingMessage): Promise<ResolvedAuthRequest> {
    return this.resolveRequest(request.headers, request.url);
  }

  async buildSessionState(resolved: ResolvedAuthRequest): Promise<AuthSessionState> {
    return {
      authenticated: Boolean(resolved.identity),
      username: resolved.identity?.username ?? null,
      expiresAt: resolved.identity?.expiresAt ?? null,
      defaultCredentialsActive: resolved.config.defaultCredentialsActive,
      message: !resolved.identity && resolved.config.defaultCredentialsActive
        ? "Default credentials are active. Sign in with admin / admin and change them in Settings."
        : null,
    };
  }

  getConfigView(config: AuthConfig): AuthConfigView {
    return {
      adminUsername: config.adminUsername,
      defaultCredentialsActive: config.defaultCredentialsActive,
      loginRequired: config.loginRequired,
      canDisableLogin: this.allowAuthBypass,
    };
  }

  // Login is bypassed only when the operator disabled it AND the instance is
  // verified loopback-bound. A network-exposed server ignores the stored flag.
  private isAuthBypassed(config: AuthConfig): boolean {
    return !config.loginRequired && this.allowAuthBypass;
  }

  issueAuthResponse(config: AuthConfig) {
    const { token, expiresAt } = createAuthToken(config);

    return {
      username: config.adminUsername,
      token,
      expiresAt,
      defaultCredentialsActive: config.defaultCredentialsActive,
    };
  }

  assertResolvedRequest(resolved: ResolvedAuthRequest) {
    if (!resolved.identity) {
      throw new BackendError(401, "auth_required", "Sign in required");
    }
  }

  requireAuth(): RequestHandler {
    return async (request, _response, next) => {
      try {
        const resolved = await this.resolveExpressRequest(request);
        this.assertResolvedRequest(resolved);
        request.dockliteAuth = resolved;
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  private async resolveRequest(headers: IncomingHttpHeaders, url: string | undefined): Promise<ResolvedAuthRequest> {
    const config = await this.configStore.read();
    const token = getBearerToken(headers) ?? getTokenFromUrl(url, getHeader(headers, "host"));

    // When login is disabled on a loopback instance, every request is the admin
    // regardless of token. Centralized here so the express, WebSocket-upgrade,
    // and SSE paths (all of which resolve through this method) share one gate.
    if (this.isAuthBypassed(config)) {
      return {
        config,
        token,
        identity: { username: config.adminUsername, expiresAt: NEVER_EXPIRES },
      };
    }

    const identity = token ? verifyAuthToken(token, config) : null;

    return {
      config,
      token,
      identity,
    };
  }
}
