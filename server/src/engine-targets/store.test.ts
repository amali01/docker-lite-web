import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineTargetStore } from "./store";
import type { EngineTargetProfileInput } from "./types";

// ESM builtin module namespaces aren't configurable, so vi.spyOn can't patch `readFile`
// directly; mock the module and wrap the real implementation instead, to count calls in
// the "reads only once" concurrency test below.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const fixedNow = "2026-03-31T12:00:00.000Z";

function createBuiltinTargets(): EngineTargetProfileInput[] {
  return [
    {
      id: "system",
      label: "System Docker",
      kind: "local",
      enabled: true,
      lastHealth: {
        status: "healthy",
        message: "Connected to the local Docker socket",
        checkedAt: fixedNow,
      },
      connection: {
        socketPath: "/var/run/docker.sock",
      },
    },
  ];
}

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "docklite-engine-targets-"));
  const filePath = join(dir, "engine-targets.json");

  return {
    dir,
    filePath,
    store: new EngineTargetStore({
      filePath,
      builtInTargets: createBuiltinTargets(),
      now: () => fixedNow,
    }),
  };
}

describe("EngineTargetStore", () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    vi.stubEnv("DOCKLITE_DESKTOP_DOCKER_SOCKET", "/tmp/docker-desktop.sock");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tmpDirs.length = 0;
  });

  it("resolves the store path from DOCKLITE_ENGINE_TARGETS_PATH when no filePath is given", async () => {
    const dir = await mkdtemp(join(tmpdir(), "docklite-engine-targets-"));
    tmpDirs.push(dir);
    const envPath = join(dir, "custom-engine-targets.json");
    vi.stubEnv("DOCKLITE_ENGINE_TARGETS_PATH", envPath);

    const store = new EngineTargetStore({
      builtInTargets: createBuiltinTargets(),
      now: () => fixedNow,
    });

    await store.saveTarget({
      id: "prod-ssh",
      label: "Prod Server",
      kind: "ssh",
      connection: {
        host: "prod.example.internal",
        port: 22,
      },
      ssh: {
        username: "ops",
        authMode: "agent",
      },
    });

    const raw = JSON.parse(await readFile(envPath, "utf8")) as {
      savedTargets: Array<{ id: string }>;
    };
    expect(raw.savedTargets.map((target) => target.id)).toContain("prod-ssh");
  });

  it("loads an empty store with system docker builtin and desktop seeded as saved", async () => {
    const { dir, store } = await createStore();
    tmpDirs.push(dir);

    const targets = await store.listTargets();

    expect(targets).toHaveLength(2);
    expect(targets[0]).toEqual(
      expect.objectContaining({
        id: "system",
        label: "System Docker",
        endpoint: "unix:///var/run/docker.sock",
        active: true,
        available: true,
        kind: "local",
        source: "builtin",
      }),
    );
    expect(targets[1]).toEqual(
      expect.objectContaining({
        id: "desktop-linux",
        label: "Docker Desktop",
        endpoint: "unix:///tmp/docker-desktop.sock",
        active: false,
        available: true,
        kind: "local",
        source: "saved",
      }),
    );
  });

  it("migrates legacy stores so desktop becomes a saved target while system stays default", async () => {
    const { dir, filePath } = await createStore();
    tmpDirs.push(dir);

    await writeFile(
      filePath,
      JSON.stringify(
        {
          activeTargetId: "system",
          savedTargets: [],
        },
        null,
        2,
      ),
      "utf8",
    );

    const store = new EngineTargetStore({
      filePath,
      builtInTargets: createBuiltinTargets(),
      now: () => fixedNow,
    });

    const targets = await store.listTargets();
    const desktopTarget = targets.find((target) => target.id === "desktop-linux");
    const systemTarget = targets.find((target) => target.id === "system");

    expect(systemTarget?.active).toBe(true);
    expect(systemTarget?.source).toBe("builtin");
    expect(desktopTarget).toEqual(
      expect.objectContaining({
        id: "desktop-linux",
        source: "saved",
        available: true,
      }),
    );

    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      version: number;
      savedTargets: Array<{ id: string; source: string }>;
    };
    expect(raw.version).toBe(2);
    expect(raw.savedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "desktop-linux",
          source: "saved",
        }),
      ]),
    );
  });

  it("resets legacy desktop-linux selection back to system docker", async () => {
    const { dir, filePath } = await createStore();
    tmpDirs.push(dir);

    await writeFile(
      filePath,
      JSON.stringify(
        {
          activeTargetId: "desktop-linux",
          savedTargets: [],
        },
        null,
        2,
      ),
      "utf8",
    );

    const store = new EngineTargetStore({
      filePath,
      builtInTargets: createBuiltinTargets(),
      now: () => fixedNow,
    });

    const targets = await store.listTargets();
    const activeTarget = targets.find((target) => target.active);

    expect(activeTarget?.id).toBe("system");

    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      version: number;
      activeTargetId: string;
    };
    expect(raw.version).toBe(2);
    expect(raw.activeTargetId).toBe("system");
  });

  it("persists saved SSH and TLS targets", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await store.saveTarget({
      id: "prod-ssh",
      label: "Prod Server",
      kind: "ssh",
      connection: {
        host: "prod.example.internal",
        port: 22,
      },
      ssh: {
        username: "ops",
        authMode: "agent",
        keyPath: "/secure/id_ed25519",
        knownHostsPath: "/secure/known_hosts",
        dockerHostOverride: null,
      },
    });

    await store.saveTarget({
      id: "staging-tls",
      label: "Staging TLS",
      kind: "tcpTls",
      connection: {
        host: "staging.example.internal",
        port: 2376,
      },
      tls: {
        tlsMode: "mtls",
        serverName: "staging.example.internal",
        caPath: "/secure/ca.pem",
        certPath: "/secure/cert.pem",
        keyPath: "/secure/key.pem",
      },
    });

    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      activeTargetId: string;
      savedTargets: unknown[];
    };

    expect(raw.activeTargetId).toBe("system");
    expect(raw.savedTargets).toHaveLength(3);
    expect(raw.savedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "desktop-linux",
          kind: "local",
        }),
        expect.objectContaining({
          id: "prod-ssh",
          kind: "ssh",
          ssh: expect.objectContaining({
            username: "ops",
          }),
        }),
        expect.objectContaining({
          id: "staging-tls",
          kind: "tcpTls",
          tls: expect.objectContaining({
            tlsMode: "mtls",
          }),
        }),
      ]),
    );

    const reloaded = new EngineTargetStore({
      filePath,
      builtInTargets: createBuiltinTargets(),
      now: () => fixedNow,
    });
    const targets = await reloaded.listTargets();

    expect(targets.some((target) => target.id === "prod-ssh")).toBe(true);
    expect(targets.some((target) => target.id === "staging-tls")).toBe(true);
  });

  it("sanitizes API-visible target output", async () => {
    const { dir, store } = await createStore();
    tmpDirs.push(dir);

    await store.saveTarget({
      id: "prod-ssh",
      label: "Prod Server",
      kind: "ssh",
      connection: {
        host: "prod.example.internal",
        port: 22,
      },
      ssh: {
        username: "ops",
        authMode: "agent",
        keyPath: "/secure/id_ed25519",
        knownHostsPath: "/secure/known_hosts",
        dockerHostOverride: null,
      },
    });

    const targets = await store.listTargets();
    const target = targets.find((item) => item.id === "prod-ssh");

    expect(target).toEqual(
      expect.objectContaining({
        id: "prod-ssh",
        label: "Prod Server",
        endpoint: "ssh://ops@prod.example.internal",
        active: false,
        available: false,
        kind: "ssh",
        source: "saved",
      }),
    );
    expect(target).not.toHaveProperty("connection");
    expect(target).not.toHaveProperty("ssh");
    expect(target).not.toHaveProperty("tls");
    expect(target).not.toHaveProperty("createdAt");
    expect(target).not.toHaveProperty("updatedAt");
  });

  it("preserves active target selection", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await store.saveTarget({
      id: "prod-ssh",
      label: "Prod Server",
      kind: "ssh",
      connection: {
        host: "prod.example.internal",
        port: 22,
      },
      ssh: {
        username: "ops",
        authMode: "agent",
        keyPath: "/secure/id_ed25519",
        knownHostsPath: "/secure/known_hosts",
        dockerHostOverride: null,
      },
    });

    await store.selectTarget("prod-ssh");

    const reloaded = new EngineTargetStore({
      filePath,
      builtInTargets: createBuiltinTargets(),
      now: () => fixedNow,
    });
    const targets = await reloaded.listTargets();
    const activeTarget = targets.find((target) => target.active);

    expect(activeTarget?.id).toBe("prod-ssh");

    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      activeTargetId: string;
    };
    expect(raw.activeTargetId).toBe("prod-ssh");
  });

  it("deletes a saved target from storage", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await store.saveTarget({
      id: "prod-ssh",
      label: "Prod Server",
      kind: "ssh",
      connection: {
        host: "prod.example.internal",
        port: 22,
      },
      ssh: {
        username: "ops",
        authMode: "agent",
        keyPath: "/secure/id_ed25519",
        knownHostsPath: "/secure/known_hosts",
        dockerHostOverride: null,
      },
    });

    await store.deleteTarget("prod-ssh");

    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      savedTargets: unknown[];
    };

    expect(raw.savedTargets).toHaveLength(1);
    expect(raw.savedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "desktop-linux",
          kind: "local",
        }),
      ]),
    );

    const targets = await store.listTargets();
    expect(targets.some((target) => target.id === "prod-ssh")).toBe(false);
  });

  it("survives two concurrent saveTarget calls without dropping either write", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    const targetA: EngineTargetProfileInput = {
      id: "prod-ssh",
      label: "Prod Server",
      kind: "ssh",
      connection: { host: "prod.example.internal", port: 22 },
      ssh: { username: "ops", authMode: "agent" },
    };
    const targetB: EngineTargetProfileInput = {
      id: "staging-tls",
      label: "Staging TLS",
      kind: "tcpTls",
      connection: { host: "staging.example.internal", port: 2376 },
      tls: {
        tlsMode: "mtls",
        serverName: "staging.example.internal",
        caPath: "/secure/ca.pem",
        certPath: "/secure/cert.pem",
        keyPath: "/secure/key.pem",
      },
    };

    await Promise.all([store.saveTarget(targetA), store.saveTarget(targetB)]);

    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      savedTargets: Array<{ id: string }>;
    };
    const ids = raw.savedTargets.map((target) => target.id);

    expect(ids).toContain("prod-ssh");
    expect(ids).toContain("staging-tls");

    const targets = await store.listTargets();
    expect(targets.some((target) => target.id === "prod-ssh")).toBe(true);
    expect(targets.some((target) => target.id === "staging-tls")).toBe(true);
  });

  it("reads and persists only once for concurrent first-touch calls", async () => {
    const { dir, store } = await createStore();
    tmpDirs.push(dir);

    const readFileMock = vi.mocked(fsPromises.readFile);
    readFileMock.mockClear();

    await Promise.all([store.listTargets(), store.getSavedTargets(), store.getActiveTargetProfile()]);

    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it("writes the state file as 0o600 inside a 0o700 directory", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await store.saveTarget({
      id: "prod-ssh",
      label: "Prod Server",
      kind: "ssh",
      connection: { host: "prod.example.internal", port: 22 },
      ssh: { username: "ops", authMode: "agent" },
    });

    const fileStat = await stat(filePath);
    const dirStat = await stat(dirname(filePath));

    expect(fileStat.mode & 0o777).toBe(0o600);
    expect(dirStat.mode & 0o777).toBe(0o700);
  });

  it("recovers from a corrupt state file by quarantining it and starting clean", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await writeFile(filePath, "{ not valid json", "utf8");

    const targets = await store.listTargets();
    expect(targets.some((target) => target.id === "system")).toBe(true);

    // The corrupt original is preserved alongside the new clean file, not deleted.
    const entries = await fsPromises.readdir(dir);
    const quarantined = entries.filter((name) => name.startsWith("engine-targets.json.corrupt-"));
    expect(quarantined).toHaveLength(1);

    const preservedContent = await readFile(join(dir, quarantined[0]), "utf8");
    expect(preservedContent).toBe("{ not valid json");

    const raw = JSON.parse(await readFile(filePath, "utf8")) as { savedTargets: unknown[] };
    expect(raw).toHaveProperty("savedTargets");
  });

  it("recovers from a state file that fails schema validation", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await writeFile(filePath, JSON.stringify({ activeTargetId: 42, savedTargets: "nope" }), "utf8");

    const targets = await store.listTargets();
    expect(targets.some((target) => target.id === "system")).toBe(true);

    const entries = await fsPromises.readdir(dir);
    expect(entries.some((name) => name.startsWith("engine-targets.json.corrupt-"))).toBe(true);
  });
});
