import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
    {
      id: "desktop-linux",
      label: "Docker Desktop",
      kind: "local",
      enabled: true,
      lastHealth: {
        status: "healthy",
        message: "Connected to Docker Desktop",
        checkedAt: fixedNow,
      },
      connection: {
        socketPath: "/home/amali/.docker/desktop/docker.sock",
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

  afterEach(async () => {
    await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tmpDirs.length = 0;
  });

  it("loads an empty store with built-in defaults", async () => {
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
    expect(raw.savedTargets).toHaveLength(2);
    expect(raw.savedTargets[0]).toEqual(
      expect.objectContaining({
        id: "prod-ssh",
        kind: "ssh",
        ssh: expect.objectContaining({
          username: "ops",
        }),
      }),
    );
    expect(raw.savedTargets[1]).toEqual(
      expect.objectContaining({
        id: "staging-tls",
        kind: "tcpTls",
        tls: expect.objectContaining({
          tlsMode: "mtls",
        }),
      }),
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

    expect(raw.savedTargets).toHaveLength(0);

    const targets = await store.listTargets();
    expect(targets.some((target) => target.id === "prod-ssh")).toBe(false);
  });
});
