import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDockerBackend,
  createDockerBackendFromEnv,
  isContainerInProject,
  isContainerLabeledForProject,
  parseImageReference,
} from "./client";
import { inferComposeProjectFromName } from "../../../src/lib/compose-project";

/**
 * A minimal in-memory stand-in for the Docker Engine, just rich enough to
 * exercise the real (non-mock) backend: it records every call it receives so
 * tests can assert on ordering, and lets a test arm a specific failure.
 *
 * `vi.hoisted` is required because the `vi.mock("dockerode")` factory below is
 * hoisted above the imports and has to close over this state.
 */
const engine = vi.hoisted(() => {
  type FakeInspect = {
    Id: string;
    Name: string;
    Created: string;
    State: { Status: string; Running: boolean; StartedAt: string };
    Config: {
      Image: string;
      Hostname: string;
      Domainname: string;
      User: string;
      AttachStdin: boolean;
      AttachStdout: boolean;
      AttachStderr: boolean;
      Tty: boolean;
      OpenStdin: boolean;
      StdinOnce: boolean;
      Env: string[];
      Cmd: string[];
      Entrypoint?: string[];
      Labels: Record<string, string>;
      Volumes: Record<string, object>;
      WorkingDir: string;
      ExposedPorts: Record<string, object>;
      // Real Docker API fields that @types/dockerode does not declare.
      StopSignal?: string;
      StopTimeout?: number;
      Shell?: string[];
      OnBuild?: string[];
      MacAddress?: string;
    };
    HostConfig: Record<string, unknown>;
    NetworkSettings: {
      Ports: Record<string, Array<{ HostIp: string; HostPort: string }>>;
      Networks: Record<string, Record<string, unknown>>;
    };
  };

  type ListedContainer = {
    Id: string;
    Names: string[];
    Image: string;
    Labels: Record<string, string>;
    State: string;
    Status: string;
    Ports: Array<{ PrivatePort: number; Type: string }>;
    Created: number;
  };

  return {
    containers: new Map<string, FakeInspect>(),
    listed: [] as ListedContainer[],
    images: new Map<string, { Id: string; RepoTags: string[]; Size: number; Created: string }>(),
    volumes: [] as Array<Record<string, unknown>>,
    createdOptions: [] as Array<Record<string, unknown>>,
    calls: [] as string[],
    statsCalls: [] as string[],
    failures: { pull: false, create: false, start: false },
    nextId: 0,
    reset() {
      this.containers.clear();
      this.listed = [];
      this.images.clear();
      this.volumes = [];
      this.createdOptions = [];
      this.calls = [];
      this.statsCalls = [];
      this.failures = { pull: false, create: false, start: false };
      this.nextId = 0;
    },
  };
});

vi.mock("dockerode", () => {
  const notFound = (what: string) => Object.assign(new Error(`no such ${what}`), { statusCode: 404 });

  class FakeContainer {
    constructor(public id: string) {}

    private record() {
      const info = engine.containers.get(this.id);

      if (!info) {
        throw notFound(`container ${this.id}`);
      }

      return info;
    }

    async inspect() {
      return structuredClone(this.record());
    }

    async stop() {
      engine.calls.push(`stop:${this.record().Name}`);
      this.record().State = { Status: "exited", Running: false, StartedAt: "" };
    }

    async start() {
      const info = this.record();
      engine.calls.push(`start:${info.Name}`);

      // Only the replacement refuses to start — the original must still be
      // startable, which is exactly what a rollback depends on.
      if (engine.failures.start && this.id.startsWith("replacement")) {
        throw new Error("replacement refused to start");
      }

      info.State = { Status: "running", Running: true, StartedAt: new Date().toISOString() };
    }

    async restart() {
      engine.calls.push(`restart:${this.record().Name}`);
    }

    async rename(options: { name: string }) {
      const info = this.record();
      engine.calls.push(`rename:${info.Name}->${options.name}`);
      info.Name = `/${options.name}`;
    }

    async remove() {
      engine.calls.push(`remove:${this.record().Name}`);
      engine.containers.delete(this.id);
    }

    async stats() {
      engine.statsCalls.push(this.id);
      return {
        cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 2000, online_cpus: 2 },
        precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
        memory_stats: { usage: 1024 * 1024, limit: 4 * 1024 * 1024, stats: { cache: 0 } },
        networks: { eth0: { rx_bytes: 1024, tx_bytes: 2048 } },
      };
    }
  }

  class FakeDocker {
    modem = {
      followProgress(_stream: unknown, callback: (error: Error | null, output: unknown[]) => void) {
        callback(null, []);
      },
      demuxStream() {},
    };

    getContainer(id: string) {
      return new FakeContainer(id);
    }

    getImage(reference: string) {
      return {
        async inspect() {
          const image = engine.images.get(reference);

          if (!image) {
            throw notFound(`image ${reference}`);
          }

          return image;
        },
      };
    }

    getNetwork(name: string) {
      return {
        async connect(options: { Container?: string }) {
          engine.calls.push(`connect:${name}:${options.Container ?? ""}`);
        },
      };
    }

    async pull(reference: string) {
      engine.calls.push(`pull:${reference}`);

      if (engine.failures.pull) {
        throw new Error("pull access denied");
      }

      return {};
    }

    async createContainer(options: Record<string, unknown>) {
      engine.calls.push(`create:${String(options.name)}`);

      if (engine.failures.create) {
        throw new Error("port is already allocated");
      }

      engine.createdOptions.push(options);
      const id = `replacement${++engine.nextId}`;
      engine.containers.set(id, {
        Id: id,
        Name: `/${String(options.name)}`,
        Created: new Date().toISOString(),
        State: { Status: "created", Running: false, StartedAt: "" },
        Config: {
          Image: String(options.Image),
          Hostname: "",
          Domainname: "",
          User: "",
          AttachStdin: false,
          AttachStdout: false,
          AttachStderr: false,
          Tty: false,
          OpenStdin: false,
          StdinOnce: false,
          Env: [],
          Cmd: [],
          Labels: {},
          Volumes: {},
          WorkingDir: "",
          ExposedPorts: {},
        },
        HostConfig: {},
        NetworkSettings: { Ports: {}, Networks: {} },
      });
      return new FakeContainer(id);
    }

    async listContainers() {
      return structuredClone(engine.listed);
    }

    async listImages() {
      return [...engine.images.values()];
    }

    async listVolumes() {
      return { Volumes: structuredClone(engine.volumes) };
    }
  }

  return { default: FakeDocker };
});

function runningContainerFixture() {
  engine.containers.set("original1", {
    Id: "original1234567",
    Name: "/web",
    Created: "2024-01-02T03:04:05Z",
    State: { Status: "running", Running: true, StartedAt: "2024-01-02T03:04:05Z" },
    Config: {
      Image: "ghcr.io/acme/web:1.4",
      Hostname: "original1234",
      Domainname: "",
      User: "app",
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      OpenStdin: false,
      StdinOnce: false,
      Env: ["NODE_ENV=production", "PORT=8080"],
      Cmd: ["node", "server.js"],
      Entrypoint: ["/entrypoint.sh"],
      Labels: { "com.docker.compose.project": "acme", owner: "platform" },
      Volumes: { "/data": {} },
      WorkingDir: "/srv",
      ExposedPorts: { "8080/tcp": {} },
      StopSignal: "SIGQUIT",
      StopTimeout: 45,
      Shell: ["/bin/bash", "-c"],
      OnBuild: ["RUN echo hi"],
      MacAddress: "02:42:ac:11:00:99",
    },
    HostConfig: {
      PortBindings: { "8080/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }] },
      RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
      Binds: ["web-data:/data"],
      Mounts: [{ Type: "volume", Source: "web-data", Target: "/data" }],
      NetworkMode: "frontend",
      Memory: 512 * 1024 * 1024,
    },
    NetworkSettings: {
      Ports: { "8080/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }] },
      Networks: {
        frontend: {
          NetworkID: "net-front",
          EndpointID: "endpoint-front",
          Gateway: "172.18.0.1",
          IPAddress: "172.18.0.7",
          IPPrefixLen: 16,
          IPv6Gateway: "",
          GlobalIPv6Address: "",
          GlobalIPv6PrefixLen: 0,
          MacAddress: "02:42:ac:12:00:07",
          Aliases: ["web", "original1234"],
          IPAMConfig: { IPv4Address: "172.18.0.7" },
        },
        backend: {
          NetworkID: "net-back",
          EndpointID: "endpoint-back",
          Gateway: "172.19.0.1",
          IPAddress: "172.19.0.4",
          IPPrefixLen: 16,
          IPv6Gateway: "",
          GlobalIPv6Address: "",
          GlobalIPv6PrefixLen: 0,
          MacAddress: "02:42:ac:13:00:04",
          Aliases: ["web"],
        },
      },
    },
  });

  return engine.containers.get("original1");
}

beforeEach(() => {
  engine.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

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

// H3 regression guard: an unrelated standalone container that merely shares
// a compose project's name prefix must never be treated as project member by
// a destructive action.
describe("compose project matching (H3, M24)", () => {
  const labeledProjectMember = { composeProject: "redis", name: "redis-1" };
  const unlabeledStandaloneContainer = { composeProject: null, name: "redis-cache" };

  it("infers the standalone container's name into the same project (the trap H3 warns about)", () => {
    expect(inferComposeProjectFromName(unlabeledStandaloneContainer.name)).toBe("redis");
  });

  it("label-only match (used by remove) excludes the unlabeled standalone container", () => {
    expect(isContainerLabeledForProject(labeledProjectMember, "redis")).toBe(true);
    expect(isContainerLabeledForProject(unlabeledStandaloneContainer, "redis")).toBe(false);
  });

  it("label-or-heuristic match (used by start/stop and display grouping) still includes it", () => {
    expect(isContainerInProject(labeledProjectMember, "redis")).toBe(true);
    expect(isContainerInProject(unlabeledStandaloneContainer, "redis")).toBe(true);
  });

  it("removeComposeProject only removes labeled members, never a name-alike standalone container", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const backend = await createDockerBackendFromEnv();

    // None of the built-in mock containers collide with "app-stack" by name
    // heuristic alone, so this exercises the real label-only removal path
    // against the shared mock fixture without needing to add a colliding one.
    const before = await backend.listContainers();
    const labeledForAppStack = before.filter((c) => c.composeProject === "app-stack");
    expect(labeledForAppStack.length).toBeGreaterThan(0);

    await backend.removeComposeProject("app-stack");

    const after = await backend.listContainers();
    expect(after.some((c) => c.composeProject === "app-stack")).toBe(false);
    // Every container that was NOT labeled for the project survives untouched.
    const survivingIds = new Set(after.map((c) => c.id));
    for (const container of before) {
      if (container.composeProject !== "app-stack") {
        expect(survivingIds.has(container.id)).toBe(true);
      }
    }
  });

  // The exact scenario H3 describes, end to end against the mock adapter:
  // the fixture's `nginx-proxy` carries NO compose label but its name infers
  // the project "nginx". Removing a stack called "nginx" must leave it alone.
  // Against the pre-fix code this test fails — `nginx-proxy` was force-removed.
  it("removing a stack does not touch an unlabeled container that only name-infers into it", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const backend = await createDockerBackendFromEnv();

    const before = await backend.listContainers();
    const decoy = before.find((container) => container.name === "nginx-proxy");

    // Guard the fixture itself: if this stops holding, the test below stops
    // testing anything and must be re-pointed at a real collision.
    expect(decoy).toBeDefined();
    expect(decoy?.composeProject).toBeNull();
    expect(inferComposeProjectFromName("nginx-proxy")).toBe("nginx");

    // Nothing carries the "nginx" label, so the stack genuinely does not exist
    // and the call reports that — rather than silently eating the name-alike.
    await expect(backend.removeComposeProject("nginx")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });

    const after = await backend.listContainers();
    expect(after.some((container) => container.name === "nginx-proxy")).toBe(true);
    expect(after).toHaveLength(before.length);
  });

  it("both sides of the shared inference agree", () => {
    // The server's combined predicate and the client's display heuristic
    // must derive from the same function so grouping and (non-destructive)
    // actions never drift apart.
    expect(isContainerInProject(unlabeledStandaloneContainer, "redis")).toBe(
      inferComposeProjectFromName(unlabeledStandaloneContainer.name) === "redis",
    );
  });
});

// M5 regression guard: the tag separator is the last `:` *after* the last `/`.
// Against the old `image.split(":")` the registry-port and digest cases below
// produce repository "registry.example.com" / tag "5000/app", the lookup that
// follows a successful pull misses, and the route answers 500.
describe("parseImageReference (M5)", () => {
  it.each([
    ["nginx", "nginx", "latest"],
    ["nginx:1.25", "nginx", "1.25"],
    ["ghcr.io/acme/web:1.4", "ghcr.io/acme/web", "1.4"],
    ["registry.example.com:5000/app", "registry.example.com:5000/app", "latest"],
    ["registry.example.com:5000/ns/app:v2", "registry.example.com:5000/ns/app", "v2"],
    ["alpine@sha256:deadbeefcafe", "alpine", "sha256:deadbeefcafe"],
    ["registry.example.com:5000/app@sha256:deadbeefcafe", "registry.example.com:5000/app", "sha256:deadbeefcafe"],
  ])("splits %s", (reference, repository, tag) => {
    expect(parseImageReference(reference)).toEqual({ repository, tag });
  });
});

describe("pullImage against the engine (M5)", () => {
  it("returns the image for a registry-with-port reference instead of failing the pull", async () => {
    engine.images.set("registry.example.com:5000/app", {
      Id: "sha256:aaa",
      RepoTags: ["registry.example.com:5000/app:latest"],
      Size: 1024,
      Created: "2024-05-06T07:08:09Z",
    });
    const backend = await createDockerBackend({}, "tcp://test");

    const pulled = await backend.pullImage({ image: "registry.example.com:5000/app" });

    expect(engine.calls).toContain("pull:registry.example.com:5000/app");
    expect(pulled).toMatchObject({
      id: "sha256:aaa",
      repository: "registry.example.com:5000/app",
      tag: "latest",
      created: "2024-05-06",
    });
  });

  it("resolves a digest reference, which never carries a matching repo tag", async () => {
    engine.images.set("alpine@sha256:deadbeefcafe", {
      Id: "sha256:bbb",
      RepoTags: [],
      Size: 2048,
      Created: "2023-01-01T00:00:00Z",
    });
    const backend = await createDockerBackend({}, "tcp://test");

    const pulled = await backend.pullImage({ image: "alpine@sha256:deadbeefcafe" });

    expect(pulled).toMatchObject({ id: "sha256:bbb", repository: "alpine", tag: "sha256:deadbeefcafe" });
  });

  it("still rejects a blank image name", async () => {
    const backend = await createDockerBackend({}, "tcp://test");
    await expect(backend.pullImage({ image: "   " })).rejects.toMatchObject({ status: 400 });
  });
});

// M6 regression guard: the volume list used to stamp `new Date()` on every row,
// so a volume created years ago reported today's date.
describe("listVolumes created date (M6)", () => {
  it("reports the engine's CreatedAt, not today", async () => {
    engine.volumes = [
      {
        Name: "web-data",
        Driver: "local",
        Mountpoint: "/var/lib/docker/volumes/web-data/_data",
        CreatedAt: "2019-03-04T12:00:00Z",
        UsageData: { Size: 4096, RefCount: 1 },
      },
    ];
    const backend = await createDockerBackend({}, "tcp://test");

    const [volume] = await backend.listVolumes();

    expect(volume.created).toBe("2019-03-04");
    expect(volume.created).not.toBe(new Date().toISOString().slice(0, 10));
  });

  it("falls back to now when the engine omits CreatedAt", async () => {
    engine.volumes = [{ Name: "legacy", Driver: "local", Mountpoint: "/tmp/legacy" }];
    const backend = await createDockerBackend({}, "tcp://test");

    const [volume] = await backend.listVolumes();

    expect(volume.created).toBe(new Date().toISOString().slice(0, 10));
  });
});

// M7 regression guard: `rebuildContainer` used to only restart. It must now do
// a real recreate, and — because that is destructive — it must never remove the
// original before a replacement has actually started.
describe("rebuildContainer recreates the container (M7)", () => {
  it("pulls, renames the original, creates and starts the replacement, then removes the original", async () => {
    runningContainerFixture();
    const backend = await createDockerBackend({}, "tcp://test");

    const summary = await backend.rebuildContainer("original1");

    expect(engine.calls).toEqual([
      "pull:ghcr.io/acme/web:1.4",
      "stop:/web",
      "rename:/web->web-docklite-superseded-" + engine.calls[2].split("superseded-")[1],
      "create:web",
      "connect:backend:replacement1",
      "start:/web",
      "remove:/web-docklite-superseded-" + engine.calls[2].split("superseded-")[1],
    ]);

    // The original is only disposable once the replacement is proven startable.
    const startedAt = engine.calls.indexOf("start:/web");
    const removedAt = engine.calls.findIndex((call) => call.startsWith("remove:"));
    expect(startedAt).toBeLessThan(removedAt);
    expect(summary.name).toBe("web");
  });

  it("preserves name, host config, env, labels and every network attachment", async () => {
    runningContainerFixture();
    const backend = await createDockerBackend({}, "tcp://test");

    await backend.rebuildContainer("original1");

    const [options] = engine.createdOptions;
    expect(options).toMatchObject({
      name: "web",
      Image: "ghcr.io/acme/web:1.4",
      Env: ["NODE_ENV=production", "PORT=8080"],
      Cmd: ["node", "server.js"],
      Entrypoint: ["/entrypoint.sh"],
      Labels: { "com.docker.compose.project": "acme", owner: "platform" },
      WorkingDir: "/srv",
      User: "app",
      ExposedPorts: { "8080/tcp": {} },
      HostConfig: {
        PortBindings: { "8080/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }] },
        RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
        Binds: ["web-data:/data"],
        Mounts: [{ Type: "volume", Source: "web-data", Target: "/data" }],
        Memory: 512 * 1024 * 1024,
      },
    });

    // Only one endpoint may be declared at create time; the rest are attached
    // before the replacement starts.
    expect(options.NetworkingConfig).toEqual({
      EndpointsConfig: { frontend: { IPAMConfig: { IPv4Address: "172.18.0.7" }, Aliases: ["web"] } },
    });
    expect(engine.calls).toContain("connect:backend:replacement1");

    // The old container's runtime identity must not be re-declared.
    expect(options.Hostname).toBeUndefined();
  });

  // Before the recreate a "rebuild" was only a restart, so these survived
  // trivially. A container that silently lost its StopSignal would be killed
  // with the default signal on its next stop — a behaviour change the user
  // never asked for and would not notice until it mattered.
  it("preserves config fields that @types/dockerode does not declare", async () => {
    runningContainerFixture();
    const backend = await createDockerBackend({}, "tcp://test");

    await backend.rebuildContainer("original1");

    const [options] = engine.createdOptions;
    expect(options).toMatchObject({
      StopSignal: "SIGQUIT",
      StopTimeout: 45,
      Shell: ["/bin/bash", "-c"],
      OnBuild: ["RUN echo hi"],
      MacAddress: "02:42:ac:11:00:99",
    });
  });

  it("omits undeclared config fields the engine did not report", async () => {
    const fixture = runningContainerFixture();
    delete fixture?.Config.StopSignal;
    delete fixture?.Config.StopTimeout;
    delete fixture?.Config.Shell;
    delete fixture?.Config.OnBuild;
    delete fixture?.Config.MacAddress;
    const backend = await createDockerBackend({}, "tcp://test");

    await backend.rebuildContainer("original1");

    const [options] = engine.createdOptions;
    expect(options).not.toHaveProperty("StopSignal");
    expect(options).not.toHaveProperty("StopTimeout");
    expect(options).not.toHaveProperty("MacAddress");
  });

  it("rolls back: a failed create leaves the original under its own name, running", async () => {
    runningContainerFixture();
    engine.failures.create = true;
    const backend = await createDockerBackend({}, "tcp://test");

    await expect(backend.rebuildContainer("original1")).rejects.toMatchObject({
      message: expect.stringContaining("port is already allocated"),
    });

    const original = engine.containers.get("original1");
    expect(original).toBeDefined();
    expect(original?.Name).toBe("/web");
    expect(original?.State.Running).toBe(true);
    expect(engine.calls.some((call) => call.startsWith("remove:"))).toBe(false);
  });

  it("rolls back: a replacement that will not start is removed and the original restored", async () => {
    runningContainerFixture();
    engine.failures.start = true;
    const backend = await createDockerBackend({}, "tcp://test");

    await expect(backend.rebuildContainer("original1")).rejects.toMatchObject({
      message: expect.stringContaining("replacement refused to start"),
    });

    const original = engine.containers.get("original1");
    expect(original?.Name).toBe("/web");
    expect(original?.State.Running).toBe(true);
    // The half-built replacement is gone; the original never was.
    expect(engine.containers.has("replacement1")).toBe(false);
    expect(engine.calls.filter((call) => call.startsWith("remove:"))).toEqual(["remove:/web"]);
  });

  it("recreates from the local image when the registry has nothing to pull", async () => {
    runningContainerFixture();
    engine.failures.pull = true;
    const backend = await createDockerBackend({}, "tcp://test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await backend.rebuildContainer("original1");

    expect(warn).toHaveBeenCalled();
    expect(engine.calls).toContain("create:web");
    warn.mockRestore();
  });

  it("reports a missing container as 404 without touching anything", async () => {
    const backend = await createDockerBackend({}, "tcp://test");

    await expect(backend.rebuildContainer("ghost")).rejects.toMatchObject({ status: 404 });
    expect(engine.calls).toEqual([]);
  });
});

// M8 regression guard: `listContainers` fanned out one blocking ~1s
// `stats({ stream: false })` per running container on EVERY call, so each open
// browser tab multiplied the load on the daemon. Concurrent and closely-spaced
// callers must now share a single fan-out.
describe("listContainers stats fan-out (M8)", () => {
  function listedRunningContainers(count: number) {
    engine.listed = Array.from({ length: count }, (_, index) => ({
      Id: `container${index}`,
      Names: [`/app-${index}`],
      Image: "nginx:1.25",
      Labels: {},
      State: "running",
      Status: "Up 2 hours",
      Ports: [{ PrivatePort: 80, Type: "tcp" }],
      Created: 1_700_000_000,
    }));
  }

  it("collapses concurrent callers (two browser tabs) into one fan-out", async () => {
    listedRunningContainers(3);
    const backend = await createDockerBackend({}, "tcp://test");

    await Promise.all([backend.listContainers(), backend.listContainers()]);

    expect(engine.statsCalls).toHaveLength(3);
  });

  it("serves a second poll inside the TTL from cache and refreshes once it expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    listedRunningContainers(2);
    const backend = await createDockerBackend({}, "tcp://test");

    await backend.listContainers();
    expect(engine.statsCalls).toHaveLength(2);

    vi.setSystemTime(new Date("2024-01-01T00:00:05Z"));
    const cached = await backend.listContainers();
    expect(engine.statsCalls).toHaveLength(2);
    expect(cached[0].cpuPercent).not.toBeNull();

    vi.setSystemTime(new Date("2024-01-01T00:00:09Z"));
    await backend.listContainers();
    expect(engine.statsCalls).toHaveLength(4);
  });

  it("never reports cached stats against a container that has since stopped", async () => {
    listedRunningContainers(1);
    const backend = await createDockerBackend({}, "tcp://test");

    const running = await backend.listContainers();
    expect(running[0].cpuPercent).not.toBeNull();

    engine.listed[0].State = "exited";
    engine.listed[0].Status = "Exited (0) 1 second ago";
    const stopped = await backend.listContainers();

    expect(stopped[0].cpuPercent).toBeNull();
    expect(stopped[0].memUsage).toBeNull();
  });
});
