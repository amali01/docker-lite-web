import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createDockerBackendFromEnv } from "./docker/client";

describe("DockLite backend app", () => {
  it("returns engine info", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const backend = await createDockerBackendFromEnv();
    const app = createApp(backend);

    const response = await request(app).get("/api/engine");

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.dockerVersion).toBeTruthy();
  });

  it("validates container run payloads", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const backend = await createDockerBackendFromEnv();
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
    const backend = await createDockerBackendFromEnv();
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
});
