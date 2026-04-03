import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineTargetStore } from "./store";
import type { EngineTargetProfileInput } from "./types";

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
});
