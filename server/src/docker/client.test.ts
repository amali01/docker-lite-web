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
});
