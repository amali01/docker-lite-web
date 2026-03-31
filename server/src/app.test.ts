import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { EngineController } from "./engine-controller";

describe("DockLite backend app", () => {
  it("returns engine info", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const backend = new EngineController();
    const app = createApp(backend);

    const response = await request(app).get("/api/engine");

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.dockerVersion).toBeTruthy();
  });

  it("validates container run payloads", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const backend = new EngineController();
    const app = createApp(backend);

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
    const backend = new EngineController();
    const app = createApp(backend);

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
    const backend = new EngineController();
    const app = createApp(backend);

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

  it("switches the active engine target", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    process.env.DOCKLITE_DOCKER_SOCKET = "/var/run/docker.sock";
    const backend = new EngineController();
    const app = createApp(backend);

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

  it("stops all containers in a compose project", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const backend = new EngineController();
    const app = createApp(backend);

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
    const backend = new EngineController();
    const app = createApp(backend);

    const response = await request(app).post("/api/containers/e5f6g7h8i9j0/rebuild");

    expect(response.status).toBe(200);
    expect(response.body.id).toBe("e5f6g7h8i9j0");
    expect(response.body.status).toBe("running");
  });
});
