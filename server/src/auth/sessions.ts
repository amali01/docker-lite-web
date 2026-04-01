import { randomUUID } from "node:crypto";
import { verifyCsrfToken, generateCsrfToken } from "./csrf";
import type { AuthSession, CreateSessionInput, GetSessionOptions } from "./types";

export interface SessionStoreOptions {
  now?: () => string;
  sessionIdFactory?: () => string;
  csrfTokenFactory?: () => string;
}

interface StoredSession extends AuthSession {
  idleTimeoutMinutes: number;
}

function addMinutes(timestamp: string, minutes: number): string {
  return new Date(Date.parse(timestamp) + minutes * 60_000).toISOString();
}

function addHours(timestamp: string, hours: number): string {
  return new Date(Date.parse(timestamp) + hours * 60 * 60_000).toISOString();
}

function cloneSession(session: StoredSession): AuthSession {
  return {
    id: session.id,
    csrfToken: session.csrfToken,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    idleExpiresAt: session.idleExpiresAt,
    expiresAt: session.expiresAt,
    passwordVersion: session.passwordVersion,
    remoteAddress: session.remoteAddress,
    userAgent: session.userAgent,
  };
}

export class SessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly now: () => string;
  private readonly sessionIdFactory: () => string;
  private readonly csrfTokenFactory: () => string;
  private minimumPasswordVersion = 0;

  constructor(options: SessionStoreOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.sessionIdFactory = options.sessionIdFactory ?? randomUUID;
    this.csrfTokenFactory = options.csrfTokenFactory ?? generateCsrfToken;
  }

  createSession(input: CreateSessionInput): AuthSession {
    const now = this.now();
    const session: StoredSession = {
      id: this.sessionIdFactory(),
      csrfToken: this.csrfTokenFactory(),
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt: addMinutes(now, input.idleTimeoutMinutes),
      expiresAt: addHours(now, input.absoluteTimeoutHours),
      passwordVersion: input.passwordVersion,
      remoteAddress: input.remoteAddress ?? null,
      userAgent: input.userAgent ?? null,
      idleTimeoutMinutes: input.idleTimeoutMinutes,
    };

    this.sessions.set(session.id, session);

    return cloneSession(session);
  }

  getSession(sessionId: string, options: GetSessionOptions): AuthSession | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    const now = this.now();

    if (this.isInvalid(session, now, options.currentPasswordVersion)) {
      this.sessions.delete(sessionId);
      return null;
    }

    if (options.touch ?? true) {
      session.lastSeenAt = now;
      const nextIdleExpiry = addMinutes(now, session.idleTimeoutMinutes);
      session.idleExpiresAt = Date.parse(nextIdleExpiry) > Date.parse(session.expiresAt) ? session.expiresAt : nextIdleExpiry;
    }

    return cloneSession(session);
  }

  verifyCsrf(sessionId: string, token: string | null | undefined, options: GetSessionOptions): boolean {
    const session = this.getSession(sessionId, {
      ...options,
      touch: false,
    });

    if (!session) {
      return false;
    }

    return verifyCsrfToken(session.csrfToken, token);
  }

  revokeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  revokeAllForPasswordChange(nextPasswordVersion: number): number {
    this.minimumPasswordVersion = Math.max(this.minimumPasswordVersion, nextPasswordVersion);

    let revoked = 0;

    for (const [sessionId, session] of this.sessions) {
      if (session.passwordVersion < nextPasswordVersion) {
        this.sessions.delete(sessionId);
        revoked += 1;
      }
    }

    return revoked;
  }

  private isInvalid(session: StoredSession, now: string, currentPasswordVersion: number): boolean {
    if (session.passwordVersion < this.minimumPasswordVersion) {
      return true;
    }

    if (session.passwordVersion !== currentPasswordVersion) {
      return true;
    }

    if (Date.parse(now) > Date.parse(session.idleExpiresAt)) {
      return true;
    }

    return Date.parse(now) > Date.parse(session.expiresAt);
  }
}
