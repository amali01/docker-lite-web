import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { AuthConfigStore } from "./auth/config";
import { DockLiteAuth } from "./auth/middleware";
import { EngineManager, getDefaultEngineTargets } from "./engine-manager";
import { EngineTargetStore } from "./engine-targets/store";
import type { EngineTargetProfileInput } from "./engine-targets/types";

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

async function createTestApp(onShutdown?: () => void) {
  const dir = await mkdtemp(join(tmpdir(), "docklite-app-test-"));
  const targets = getDefaultEngineTargets();
  const backend = new EngineManager(
    targets,
    undefined,
    new EngineTargetStore({
      filePath: join(dir, "engine-targets.json"),
      builtInTargets: createBuiltInTargetInputs(),
    }),
  );

  const auth = new DockLiteAuth({
    configStore: new AuthConfigStore({
      filePath: join(dir, "auth-config.json"),
      env: {
        DOCKLITE_ADMIN_USERNAME: "admin",
        DOCKLITE_ADMIN_PASSWORD: "admin",
        DOCKLITE_AUTH_JWT_SECRET: "test-secret",
      },
    }),
  });

  return {
    dir,
    backend,
    app: createApp(backend, { auth, onShutdown }),
  };
}

async function createAuthenticatedApi(app: ReturnType<typeof createApp>) {
  const loginResponse = await request(app)
    .post("/api/auth/login")
    .send({
      username: "admin",
      password: "admin",
    });

  expect(loginResponse.status).toBe(200);

  const authHeader = {
    Authorization: `Bearer ${loginResponse.body.token as string}`,
  };

  return {
    get: (path: string) => request(app).get(path).set(authHeader),
    post: (path: string) => request(app).post(path).set(authHeader),
    patch: (path: string) => request(app).patch(path).set(authHeader),
    delete: (path: string) => request(app).delete(path).set(authHeader),
  };
}

describe("DockLite backend app", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tmpDirs.length = 0;
  });

  it("rejects an unauthenticated shutdown request", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);

    const response = await request(app).post("/api/shutdown");

    expect(response.status).toBe(401);
  });

  it("accepts an authenticated shutdown and invokes onShutdown after responding", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    let shutdownCalls = 0;
    const { app, dir } = await createTestApp(() => {
      shutdownCalls += 1;
    });
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const response = await api.post("/api/shutdown");

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ stopping: true });
    // onShutdown runs on the response 'finish' event, just after the body flushes.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shutdownCalls).toBe(1);
  });

  it("returns engine info", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const response = await api.get("/api/engine");

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.dockerVersion).toBeTruthy();
  });

  it("validates container run payloads", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const response = await api.post("/api/containers/run").send({
      image: "",
      ports: [],
      envVars: [],
      volumes: [],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_request");
  });

  it("creates and lists mock resources", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const runResponse = await api.post("/api/containers/run").send({
      image: "busybox:latest",
      name: "smoke-container",
      ports: [{ host: "8081", container: "80" }],
      envVars: [],
      volumes: [],
    });

    expect(runResponse.status).toBe(201);
    expect(runResponse.body.name).toBe("smoke-container");

    const listResponse = await api.get("/api/containers");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((container: { name: string }) => container.name === "smoke-container")).toBe(true);
  });

  it("returns available engine targets", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const response = await api.get("/api/engine/targets");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        label: expect.any(String),
        endpoint: expect.any(String),
        active: expect.any(Boolean),
      }),
    );
  });

  it("creates, tests, updates, and deletes a saved engine target", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const createResponse = await api.post("/api/engine/targets").send({
      kind: "local",
      label: "Remote Mock Docker",
      socketPath: "/tmp/mock-docker.sock",
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        label: "Remote Mock Docker",
        endpoint: "unix:///tmp/mock-docker.sock",
        kind: "local",
        source: "saved",
      }),
    );

    const createdTargetId = createResponse.body.id as string;

    const testResponse = await api.post("/api/engine/targets/test").send({
      kind: "local",
      label: "Test Mock Docker",
      socketPath: "/tmp/test-mock-docker.sock",
    });

    expect(testResponse.status).toBe(200);
    expect(testResponse.body).toEqual(
      expect.objectContaining({
        status: "healthy",
        message: expect.any(String),
      }),
    );

    const retestResponse = await api.post(`/api/engine/targets/${createdTargetId}/test`);

    expect(retestResponse.status).toBe(200);
    expect(retestResponse.body).toEqual(
      expect.objectContaining({
        status: "healthy",
      }),
    );

    const updateResponse = await api.patch(`/api/engine/targets/${createdTargetId}`).send({
      kind: "local",
      label: "Updated Mock Docker",
      socketPath: "/tmp/updated-mock-docker.sock",
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toEqual(
      expect.objectContaining({
        id: createdTargetId,
        label: "Updated Mock Docker",
        endpoint: "unix:///tmp/updated-mock-docker.sock",
      }),
    );

    const listResponse = await api.get("/api/engine/targets");
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((target: { id: string }) => target.id === createdTargetId)).toBe(true);

    const deleteResponse = await api.delete(`/api/engine/targets/${createdTargetId}`);
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await api.get("/api/engine/targets");
    expect(afterDeleteResponse.status).toBe(200);
    expect(afterDeleteResponse.body.some((target: { id: string }) => target.id === createdTargetId)).toBe(false);
  });

  it("switches the active engine target", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    process.env.DOCKLITE_DOCKER_SOCKET = "/var/run/docker.sock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const targetsResponse = await api.get("/api/engine/targets");
    expect(targetsResponse.status).toBe(200);
    expect(targetsResponse.body.length).toBeGreaterThan(1);

    const nextTarget = targetsResponse.body.find((target: { active: boolean }) => !target.active);
    expect(nextTarget).toBeTruthy();

    const switchResponse = await api
      .post("/api/engine/select")
      .send({ targetId: nextTarget.id });

    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.endpoint).toBe(nextTarget.endpoint);

    const selectedResponse = await api.get("/api/engine");
    expect(selectedResponse.status).toBe(200);
    expect(selectedResponse.body.endpoint).toBe(nextTarget.endpoint);
  });

  it("selects a saved engine target by id", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const createResponse = await api.post("/api/engine/targets").send({
      kind: "local",
      label: "Selectable Mock Docker",
      socketPath: "/tmp/selectable-mock-docker.sock",
    });

    expect(createResponse.status).toBe(201);

    const targetId = createResponse.body.id as string;
    const switchResponse = await api.post("/api/engine/select").send({ targetId });

    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.selectedEngineId).toBe(targetId);
    expect(switchResponse.body.endpoint).toBe("unix:///tmp/selectable-mock-docker.sock");

    const targetsResponse = await api.get("/api/engine/targets");
    expect(targetsResponse.status).toBe(200);
    expect(targetsResponse.body.find((target: { id: string }) => target.id === targetId)?.active).toBe(true);
  });

  it("selects a saved tcp tls engine target by id", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const createResponse = await api.post("/api/engine/targets").send({
      kind: "tcpTls",
      label: "Prod TLS Docker",
      host: "prod.example.internal",
      port: 2376,
      tlsMode: "serverOnly",
      caPath: "/tmp/prod-ca.pem",
      certPath: null,
      keyPath: null,
    });

    expect(createResponse.status).toBe(201);

    const targetId = createResponse.body.id as string;
    const switchResponse = await api.post("/api/engine/select").send({ targetId });

    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.selectedEngineId).toBe(targetId);
    expect(switchResponse.body.endpoint).toBe("tcp://prod.example.internal:2376");
  });

  it("selects a saved ssh engine target by id", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const createResponse = await api.post("/api/engine/targets").send({
      kind: "ssh",
      label: "Prod SSH Docker",
      host: "prod.example.internal",
      port: 22,
      username: "dockerops",
      authMode: "agent",
      keyPath: null,
      knownHostsPath: null,
      dockerHostOverride: null,
    });

    expect(createResponse.status).toBe(201);

    const targetId = createResponse.body.id as string;
    const switchResponse = await api.post("/api/engine/select").send({ targetId });

    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.selectedEngineId).toBe(targetId);
    expect(switchResponse.body.endpoint).toBe("ssh://dockerops@prod.example.internal");
  });

  it("stops all containers in a compose project", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const stopResponse = await api.post("/api/containers/compose/app-stack/stop");
    expect(stopResponse.status).toBe(204);

    const containersResponse = await api.get("/api/containers");
    expect(containersResponse.status).toBe(200);

    const composeContainers = containersResponse.body.filter(
      (container: { composeProject: string | null }) => container.composeProject === "app-stack",
    );

    expect(composeContainers.length).toBeGreaterThan(0);
    expect(composeContainers.every((container: { status: string }) => container.status === "stopped")).toBe(true);
  });

  it("rebuilds a container through the API", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const response = await api.post("/api/containers/e5f6g7h8i9j0/rebuild");

    expect(response.status).toBe(200);
    expect(response.body.id).toBe("e5f6g7h8i9j0");
    expect(response.body.status).toBe("running");
  });

  it("returns container detail, inspect, and stats payloads", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const detailResponse = await api.get("/api/containers/a1b2c3d4e5f6");
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.summary).toEqual(
      expect.objectContaining({
        id: "a1b2c3d4e5f6",
        name: "nginx-proxy",
      }),
    );

    const inspectResponse = await api.get("/api/containers/a1b2c3d4e5f6/inspect");
    expect(inspectResponse.status).toBe(200);
    expect(inspectResponse.body.raw).toEqual(expect.objectContaining({ Id: "a1b2c3d4e5f6" }));

    const statsResponse = await api.get("/api/containers/a1b2c3d4e5f6/stats");
    expect(statsResponse.status).toBe(200);
    expect(Array.isArray(statsResponse.body)).toBe(true);
    expect(statsResponse.body[0]).toEqual(
      expect.objectContaining({
        sampledAt: expect.any(String),
        cpuPercent: expect.any(Number),
        memoryUsageBytes: expect.any(Number),
      }),
    );
  });

  it("returns 404 for missing container detail endpoints", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);
    const api = await createAuthenticatedApi(app);

    const detailResponse = await api.get("/api/containers/missing-container");
    expect(detailResponse.status).toBe(404);
    expect(detailResponse.body.error.code).toBe("not_found");

    const inspectResponse = await api.get("/api/containers/missing-container/inspect");
    expect(inspectResponse.status).toBe(404);
    expect(inspectResponse.body.error.code).toBe("not_found");

    const statsResponse = await api.get("/api/containers/missing-container/stats");
    expect(statsResponse.status).toBe(404);
    expect(statsResponse.body.error.code).toBe("not_found");
  });
});
