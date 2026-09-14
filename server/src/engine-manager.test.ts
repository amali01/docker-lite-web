import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EngineManager, getDefaultEngineTargets } from "./engine-manager";
import { EngineTargetStore } from "./engine-targets/store";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxBin = join(repoRoot, "node_modules/.bin/tsx");
const managerModulePath = join(repoRoot, "server/src/engine-manager.ts");
const storeModulePath = join(repoRoot, "server/src/engine-targets/store.ts");

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

  it("does not crash the process when a stored backend promise rejects (H6)", async () => {
    // Regression test for CODE-AUDIT.md H6: this.backendPromise was assigned
    // without a rejection handler, so a reject (e.g. an unreadable TLS cert
    // path) became an unhandled rejection and crashed the process under
    // Node's default --unhandled-rejections=throw.
    //
    // This needs a real, separate process with no unhandledRejection listener
    // of its own: Vitest's worker registers one, which both prevents the
    // default crash-on-unhandled-rejection behavior and swallows the event
    // before a listener added from inside a test would see it. So this spawns
    // a bare `tsx` child that imports the real engine-manager.ts/store.ts and
    // reproduces the audited scenario end to end (PATCHing the
    // currently-selected tcpTls target to an unreadable certPath), then
    // asserts the child survives and still observes the real error.
    const certDir = await mkdtemp(join(tmpdir(), "docklite-cert-"));
    const goodCaPath = join(certDir, "ca.pem");
    await writeFile(goodCaPath, "placeholder ca contents");
    const badCaPath = join(certDir, "missing-ca.pem");

    const script = `
      async function main() {
        const { EngineManager, getDefaultEngineTargets } = await import(${JSON.stringify(managerModulePath)});
        const { EngineTargetStore } = await import(${JSON.stringify(storeModulePath)});
        const { mkdtemp } = await import("node:fs/promises");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");

        process.env.DOCKLITE_ADAPTER = "mock";

        const dir = await mkdtemp(join(tmpdir(), "docklite-mgr-"));
        const targets = getDefaultEngineTargets();
        const store = new EngineTargetStore({
          filePath: join(dir, "engine-targets.json"),
          builtInTargets: targets.map((target) => ({
            id: target.id,
            label: target.label,
            kind: "local",
            enabled: true,
            lastHealth: null,
            connection: { socketPath: target.socketPath },
          })),
        });
        const manager = new EngineManager(targets, undefined, store);

        const created = await manager.createTarget({
          kind: "tcpTls",
          label: "Remote TLS Docker",
          host: "10.0.0.5",
          port: 2376,
          tlsMode: "serverOnly",
          caPath: ${JSON.stringify(goodCaPath)},
          certPath: null,
          keyPath: null,
        });

        // Select it while still mocked, so this succeeds and it becomes current.
        await manager.selectTarget(created.id);

        // Force the real (non-mock) code path so updateTarget below actually
        // tries to read the (now-broken) cert file off disk.
        process.env.DOCKLITE_ADAPTER = "real";

        const updated = await manager.updateTarget(created.id, {
          kind: "tcpTls",
          caPath: ${JSON.stringify(badCaPath)},
        });
        if (updated.id !== created.id) {
          console.error("UNEXPECTED_UPDATE_RESULT");
          process.exit(2);
        }

        // Give the rejected backendPromise time to settle. With no handler
        // attached at assignment time, this is where the pre-fix code
        // crashes the process with an uncaught BackendError.
        await new Promise((resolve) => setTimeout(resolve, 300));

        try {
          await manager.getActiveBackend();
          console.error("EXPECTED_BACKEND_TO_REJECT");
          process.exit(3);
        } catch (error) {
          if (!(error instanceof Error) || !/could not be found on disk/.test(error.message)) {
            console.error("UNEXPECTED_ERROR", error);
            process.exit(4);
          }
        }

        console.log("SURVIVED");
      }

      main();
    `;

    const scriptPath = join(certDir, "repro.mts");
    await writeFile(scriptPath, script);

    const result = spawnSync(tsxBin, [scriptPath], {
      encoding: "utf8",
      timeout: 10_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.stdout + result.stderr).not.toMatch(/UnhandledPromiseRejection|Unhandled/i);
    expect(result.stdout).toContain("SURVIVED");
    expect(result.status).toBe(0);
  });
});
