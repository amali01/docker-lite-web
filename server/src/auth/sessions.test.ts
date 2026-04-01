import { describe, expect, it } from "vitest";
import { generateCsrfToken, verifyCsrfToken } from "./csrf";
import { SessionStore } from "./sessions";

describe("SessionStore", () => {
  it("creates sessions with idle and absolute expiries and extends idle on use", () => {
    let now = Date.parse("2026-04-01T00:00:00.000Z");
    let idCounter = 0;

    const store = new SessionStore({
      now: () => new Date(now).toISOString(),
      sessionIdFactory: () => `session-${++idCounter}`,
      csrfTokenFactory: () => `csrf-${idCounter}`,
    });

    const created = store.createSession({
      passwordVersion: 1,
      idleTimeoutMinutes: 30,
      absoluteTimeoutHours: 8,
      remoteAddress: "203.0.113.10",
      userAgent: "vitest",
    });

    expect(created).toEqual(
      expect.objectContaining({
        id: "session-1",
        csrfToken: "csrf-1",
        createdAt: "2026-04-01T00:00:00.000Z",
        expiresAt: "2026-04-01T08:00:00.000Z",
        idleExpiresAt: "2026-04-01T00:30:00.000Z",
        passwordVersion: 1,
      }),
    );

    now += 10 * 60 * 1000;

    const touched = store.getSession(created.id, { currentPasswordVersion: 1 });

    expect(touched).toEqual(
      expect.objectContaining({
        id: created.id,
        idleExpiresAt: "2026-04-01T00:40:00.000Z",
        expiresAt: "2026-04-01T08:00:00.000Z",
      }),
    );
  });

  it("expires sessions on idle or absolute timeout", () => {
    let now = Date.parse("2026-04-01T00:00:00.000Z");
    let idCounter = 0;

    const store = new SessionStore({
      now: () => new Date(now).toISOString(),
      sessionIdFactory: () => `session-${++idCounter}`,
      csrfTokenFactory: () => `csrf-${idCounter}`,
    });

    const idleSession = store.createSession({
      passwordVersion: 1,
      idleTimeoutMinutes: 15,
      absoluteTimeoutHours: 8,
    });
    const absoluteSession = store.createSession({
      passwordVersion: 1,
      idleTimeoutMinutes: 120,
      absoluteTimeoutHours: 1,
    });

    now += 16 * 60 * 1000;
    expect(store.getSession(idleSession.id, { currentPasswordVersion: 1 })).toBeNull();

    now = Date.parse("2026-04-01T01:01:00.000Z");
    expect(store.getSession(absoluteSession.id, { currentPasswordVersion: 1 })).toBeNull();
  });

  it("revokes all remote sessions after a password change", () => {
    let idCounter = 0;

    const store = new SessionStore({
      now: () => "2026-04-01T00:00:00.000Z",
      sessionIdFactory: () => `session-${++idCounter}`,
      csrfTokenFactory: () => `csrf-${idCounter}`,
    });

    const first = store.createSession({
      passwordVersion: 1,
      idleTimeoutMinutes: 30,
      absoluteTimeoutHours: 8,
    });
    const second = store.createSession({
      passwordVersion: 1,
      idleTimeoutMinutes: 30,
      absoluteTimeoutHours: 8,
    });

    expect(store.revokeAllForPasswordChange(2)).toBe(2);
    expect(store.getSession(first.id, { currentPasswordVersion: 2 })).toBeNull();
    expect(store.getSession(second.id, { currentPasswordVersion: 2 })).toBeNull();
  });

  it("issues per-session csrf tokens and verifies them safely", () => {
    const token = generateCsrfToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifyCsrfToken(token, token)).toBe(true);
    expect(verifyCsrfToken(token, `${token}-other`)).toBe(false);

    let idCounter = 0;
    const store = new SessionStore({
      now: () => "2026-04-01T00:00:00.000Z",
      sessionIdFactory: () => `session-${++idCounter}`,
    });

    const first = store.createSession({
      passwordVersion: 1,
      idleTimeoutMinutes: 30,
      absoluteTimeoutHours: 8,
    });
    const second = store.createSession({
      passwordVersion: 1,
      idleTimeoutMinutes: 30,
      absoluteTimeoutHours: 8,
    });

    expect(first.csrfToken).not.toBe(second.csrfToken);
    expect(store.verifyCsrf(first.id, first.csrfToken, { currentPasswordVersion: 1 })).toBe(true);
    expect(store.verifyCsrf(first.id, second.csrfToken, { currentPasswordVersion: 1 })).toBe(false);
  });
});
