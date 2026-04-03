import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { EngineController, getDefaultEngineTargets } from "../engine-controller";
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
  const backend = new EngineController(
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
      DOCKLITE_AUTH_JWT_SECRET: "test-secret",
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
