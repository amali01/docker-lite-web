import { describe, expect, it } from "vitest";
import { createDockerBackendFromEnv } from "./client";

describe("createDockerBackendFromEnv", () => {
  it("creates the mock adapter when configured", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";

    const backend = await createDockerBackendFromEnv();
    const engine = await backend.getEngineInfo();

    expect(engine.connected).toBe(true);
    expect(engine.endpoint).toContain("/var/run/docker.sock");
  });

  it("returns deterministic container detail data in mock mode", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";

    const backend = await createDockerBackendFromEnv();
    const details = await backend.getContainerDetails("a1b2c3d4e5f6");
    const stats = await backend.getContainerStats("a1b2c3d4e5f6");

    expect(details.summary.id).toBe("a1b2c3d4e5f6");
    expect(details.mounts.length).toBeGreaterThan(0);
    expect(details.labels.some((entry) => entry.key === "com.docker.compose.project")).toBe(true);
    expect(details.inspect.raw).toEqual(expect.objectContaining({ Id: "a1b2c3d4e5f6" }));
    expect(stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sampledAt: expect.any(String),
          cpuPercent: expect.any(Number),
          memoryUsageBytes: expect.any(Number),
        }),
      ]),
    );
  });
});
