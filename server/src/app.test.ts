import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { EngineController, getDefaultEngineTargets } from "./engine-controller";
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

async function createTestApp() {
  const dir = await mkdtemp(join(tmpdir(), "docklite-app-test-"));
  const targets = getDefaultEngineTargets();
  const backend = new EngineController(
    targets,
    undefined,
    new EngineTargetStore({
      filePath: join(dir, "engine-targets.json"),
      builtInTargets: createBuiltInTargetInputs(),
    }),
  );

  return {
    dir,
    backend,
    app: createApp(backend),
  };
}

describe("DockLite backend app", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tmpDirs.length = 0;
  });

  it("returns engine info", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);

    const response = await request(app).get("/api/engine");

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.dockerVersion).toBeTruthy();
  });

  it("validates container run payloads", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);

    const response = await request(app).post("/api/containers/run").send({
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

    const runResponse = await request(app).post("/api/containers/run").send({
      image: "busybox:latest",
      name: "smoke-container",
      ports: [{ host: "8081", container: "80" }],
      envVars: [],
      volumes: [],
    });

    expect(runResponse.status).toBe(201);
    expect(runResponse.body.name).toBe("smoke-container");

    const listResponse = await request(app).get("/api/containers");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((container: { name: string }) => container.name === "smoke-container")).toBe(true);
  });

  it("returns available engine targets", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);

    const response = await request(app).get("/api/engine/targets");

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

    const createResponse = await request(app).post("/api/engine/targets").send({
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

    const testResponse = await request(app).post("/api/engine/targets/test").send({
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

    const retestResponse = await request(app).post(`/api/engine/targets/${createdTargetId}/test`);

    expect(retestResponse.status).toBe(200);
    expect(retestResponse.body).toEqual(
      expect.objectContaining({
        status: "healthy",
      }),
    );

    const updateResponse = await request(app).patch(`/api/engine/targets/${createdTargetId}`).send({
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

    const listResponse = await request(app).get("/api/engine/targets");
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((target: { id: string }) => target.id === createdTargetId)).toBe(true);

    const deleteResponse = await request(app).delete(`/api/engine/targets/${createdTargetId}`);
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await request(app).get("/api/engine/targets");
    expect(afterDeleteResponse.status).toBe(200);
    expect(afterDeleteResponse.body.some((target: { id: string }) => target.id === createdTargetId)).toBe(false);
  });

  it("switches the active engine target", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    process.env.DOCKLITE_DOCKER_SOCKET = "/var/run/docker.sock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);

    const targetsResponse = await request(app).get("/api/engine/targets");
    expect(targetsResponse.status).toBe(200);
    expect(targetsResponse.body.length).toBeGreaterThan(1);

    const nextTarget = targetsResponse.body.find((target: { active: boolean }) => !target.active);
    expect(nextTarget).toBeTruthy();

    const switchResponse = await request(app)
      .post("/api/engine/select")
      .send({ targetId: nextTarget.id });

    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.endpoint).toBe(nextTarget.endpoint);

    const selectedResponse = await request(app).get("/api/engine");
    expect(selectedResponse.status).toBe(200);
    expect(selectedResponse.body.endpoint).toBe(nextTarget.endpoint);
  });

  it("selects a saved engine target by id", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);

    const createResponse = await request(app).post("/api/engine/targets").send({
      kind: "local",
      label: "Selectable Mock Docker",
      socketPath: "/tmp/selectable-mock-docker.sock",
    });

    expect(createResponse.status).toBe(201);

    const targetId = createResponse.body.id as string;
    const switchResponse = await request(app).post("/api/engine/select").send({ targetId });

    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.selectedEngineId).toBe(targetId);
    expect(switchResponse.body.endpoint).toBe("unix:///tmp/selectable-mock-docker.sock");

    const targetsResponse = await request(app).get("/api/engine/targets");
    expect(targetsResponse.status).toBe(200);
    expect(targetsResponse.body.find((target: { id: string }) => target.id === targetId)?.active).toBe(true);
  });

  it("selects a saved tcp tls engine target by id", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);

    const createResponse = await request(app).post("/api/engine/targets").send({
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
    const switchResponse = await request(app).post("/api/engine/select").send({ targetId });

    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.selectedEngineId).toBe(targetId);
    expect(switchResponse.body.endpoint).toBe("tcp://prod.example.internal:2376");
  });

  it("selects a saved ssh engine target by id", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);

    const createResponse = await request(app).post("/api/engine/targets").send({
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
    const switchResponse = await request(app).post("/api/engine/select").send({ targetId });

    expect(switchResponse.status).toBe(200);
    expect(switchResponse.body.selectedEngineId).toBe(targetId);
    expect(switchResponse.body.endpoint).toBe("ssh://dockerops@prod.example.internal");
  });

  it("stops all containers in a compose project", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const { app, dir } = await createTestApp();
    tmpDirs.push(dir);

    const stopResponse = await request(app).post("/api/containers/compose/app-stack/stop");
    expect(stopResponse.status).toBe(204);

    const containersResponse = await request(app).get("/api/containers");
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

    const response = await request(app).post("/api/containers/e5f6g7h8i9j0/rebuild");

    expect(response.status).toBe(200);
    expect(response.body.id).toBe("e5f6g7h8i9j0");
    expect(response.body.status).toBe("running");
  });
});
