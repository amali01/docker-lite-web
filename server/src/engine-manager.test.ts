import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineManager, getDefaultEngineTargets } from "./engine-manager";
import { EngineTargetStore } from "./engine-targets/store";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function makeManager() {
  const dir = await mkdtemp(join(tmpdir(), "docklite-mgr-"));
  const targets = getDefaultEngineTargets();
  const store = new EngineTargetStore({
    filePath: join(dir, "engine-targets.json"),
    builtInTargets: targets.map((target) => ({
      id: target.id,
      label: target.label,
      kind: "local" as const,
      enabled: true,
      lastHealth: null,
      connection: { socketPath: target.socketPath },
    })),
  });
  return new EngineManager(targets, undefined, store);
}

describe("EngineManager (testable without the DockerBackend facade)", () => {
  it("resolves an active backend and reports the selected engine id", async () => {
    vi.stubEnv("DOCKLITE_ADAPTER", "mock");
    const manager = await makeManager();

    const backend = await manager.getActiveBackend();
    expect(typeof backend.listContainers).toBe("function");

    const targets = await manager.listTargets();
    expect(targets.some((target) => target.id === "system")).toBe(true);

    const info = await manager.getEngineInfo();
    expect(info.selectedEngineId).toBe("system");
  });

  it("re-resolves the active backend when a target is selected", async () => {
    vi.stubEnv("DOCKLITE_ADAPTER", "mock");
    const manager = await makeManager();

    const info = await manager.selectTarget("system");
    expect(info.selectedEngineId).toBe("system");

    const backend = await manager.getActiveBackend();
    expect(typeof backend.execContainer).toBe("function");
  });
});
