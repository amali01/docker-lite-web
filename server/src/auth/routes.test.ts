import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { EngineManager, getDefaultEngineTargets } from "../engine-manager";
import { EngineTargetStore } from "../engine-targets/store";
import type { EngineTargetProfileInput } from "../engine-targets/types";
import { AuthConfigStore } from "./config";
import { DockLiteAuth } from "./middleware";

function createBuiltInTargetInputs(): EngineTargetProfileInput[] {
  const timestamp = "2026-03-31T12:00:00.000Z";

  return getDefaultEngineTargets().map((target) => ({
    id: target.id,
    label: target.label,
    kind: "local" as const,
    enabled: true,
    lastHealth: {
      status: target.adapter === "mock" ? ("healthy" as const) : ("unknown" as const),
      message: target.adapter === "mock" ? "Connected" : "Built-in target not tested yet",
      checkedAt: timestamp,
    },
    connection: {
      socketPath: target.socketPath,
    },
  }));
}

async function createAuthTestContext() {
  const dir = await mkdtemp(join(tmpdir(), "docklite-auth-test-"));
  const backend = new EngineManager(
    getDefaultEngineTargets(),
    undefined,
    new EngineTargetStore({
      filePath: join(dir, "engine-targets.json"),
      builtInTargets: createBuiltInTargetInputs(),
    }),
  );
  const authStore = new AuthConfigStore({
    filePath: join(dir, "auth-config.json"),
    env: {
      DOCKLITE_ADMIN_USERNAME: "admin",
      DOCKLITE_ADMIN_PASSWORD: "admin",
      DOCKLITE_AUTH_JWT_SECRET: "test-secret-at-least-16-chars",
    },
  });
  const auth = new DockLiteAuth({
    configStore: authStore,
  });

  return {
    dir,
    app: createApp(backend, { auth }),
  };
}

describe("auth routes", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tmpDirs.length = 0;
  });

  it("returns an unauthenticated session state without leaking password material", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createAuthTestContext();
    tmpDirs.push(dir);

    const sessionResponse = await request(app).get("/api/auth/session");

    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.authenticated).toBe(false);
    expect(sessionResponse.body.defaultCredentialsActive).toBe(true);
    expect(JSON.stringify(sessionResponse.body)).not.toContain("adminPasswordHash");
    expect(JSON.stringify(sessionResponse.body)).not.toContain("jwtSecret");
  });

  it("requires a bearer token for protected API routes", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createAuthTestContext();
    tmpDirs.push(dir);

    const response = await request(app).get("/api/engine");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("auth_required");
  });

  it("signs in with username and password and authorizes protected routes", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createAuthTestContext();
    tmpDirs.push(dir);

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({
        username: "admin",
        password: "admin",
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.username).toBe("admin");
    expect(loginResponse.body.token).toEqual(expect.any(String));
    expect(loginResponse.body.expiresAt).toEqual(expect.any(String));
    expect(loginResponse.body.defaultCredentialsActive).toBe(true);

    const engineResponse = await request(app)
      .get("/api/engine")
      .set("Authorization", `Bearer ${loginResponse.body.token as string}`);

    expect(engineResponse.status).toBe(200);
    expect(engineResponse.body.connected).toBe(true);
  });

  it("throttles repeated failed sign-ins, resets the counter on success, and lets the window expire", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";

    // Only Date is faked (setTimeout/setInterval stay real, so express and
    // supertest's socket machinery are unaffected). createLoginThrottle's
    // `now` parameter defaults to `Date.now` evaluated once, at router
    // construction — so the fake has to be installed *before* the app (and
    // its throttle) is built, or the captured reference would stay real.
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      const { app, dir } = await createAuthTestContext();
      tmpDirs.push(dir);

      // A wrong username short-circuits before argon2, so this stays fast.
      const failLogin = () => request(app).post("/api/auth/login").send({ username: "nobody", password: "wrong-pass" });
      const goodLogin = () => request(app).post("/api/auth/login").send({ username: "admin", password: "admin" });

      for (let attempt = 0; attempt < 4; attempt += 1) {
        expect((await failLogin()).status).toBe(401);
      }

      // A success must reset the failure counter: prove it by surviving 4 more
      // failures right after it. 4 + 4 = 8 is already past LOGIN_MAX_FAILURES
      // (5), so this loop would itself return 429 partway through if the
      // reset had not actually happened.
      expect((await goodLogin()).status).toBe(200);

      for (let attempt = 0; attempt < 4; attempt += 1) {
        expect((await failLogin()).status).toBe(401);
      }

      expect((await goodLogin()).status).toBe(200);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await failLogin()).status).toBe(401);
      }

      const throttled = await failLogin();

      expect(throttled.status).toBe(429);
      expect(throttled.body.error.code).toBe("too_many_login_attempts");
      expect(Number(throttled.headers["retry-after"])).toBeGreaterThan(0);

      // Correct credentials are throttled too while the window is open.
      expect((await goodLogin()).status).toBe(429);

      // The throttle is time-boxed, not a permanent lockout: once the 60s
      // window (LOGIN_WINDOW_MS in server/src/routes/auth.ts) is behind us,
      // even this previously-throttled client can sign in again.
      vi.setSystemTime(Date.now() + 61_000);
      expect((await goodLogin()).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates credentials and invalidates older tokens", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createAuthTestContext();
    tmpDirs.push(dir);

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({
        username: "admin",
        password: "admin",
      });

    const oldToken = loginResponse.body.token as string;

    const updateResponse = await request(app)
      .post("/api/auth/credentials")
      .set("Authorization", `Bearer ${oldToken}`)
      .send({
        username: "operator",
        password: "docklite-next",
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.username).toBe("operator");
    expect(updateResponse.body.defaultCredentialsActive).toBe(false);
    expect(updateResponse.body.token).toEqual(expect.any(String));

    const staleTokenResponse = await request(app)
      .get("/api/engine")
      .set("Authorization", `Bearer ${oldToken}`);

    expect(staleTokenResponse.status).toBe(401);
    expect(staleTokenResponse.body.error.code).toBe("auth_required");

    const nextLoginResponse = await request(app)
      .post("/api/auth/login")
      .send({
        username: "operator",
        password: "docklite-next",
      });

    expect(nextLoginResponse.status).toBe(200);
    expect(nextLoginResponse.body.username).toBe("operator");
  });
});
