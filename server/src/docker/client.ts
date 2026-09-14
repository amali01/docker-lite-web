import { Writable } from "node:stream";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import Docker from "dockerode";
import {
  mockContainerDetails,
  mockContainers,
  mockImages,
  mockNetworks,
  mockSystemInfo,
  mockVolumes,
} from "../../../src/lib/mock-data";
import {
  ContainerDetails,
  ContainerLogsChunk,
  ContainerLabelEntry,
  ContainerMountSummary,
  ContainerPortBinding,
  ContainerStatsSample,
  ContainerSummary,
  CreateNetworkPayload,
  CreateVolumePayload,
  DockerBackend,
  BackendError,
  ImageSummary,
  NetworkSummary,
  PullImagePayload,
  RunContainerPayload,
  VolumeSummary,
} from "../types";
import { createSshDockerConnectionConfig, createTcpTlsDockerConnectionConfig } from "../engine-targets/connection-test";
import { formatBytes, formatCreatedDate, formatPercentage, formatPorts, formatUnixDate } from "../format";
import { inferComposeProjectFromName } from "../../../src/lib/compose-project";

const DEFAULT_SOCKET_PATH = process.env.DOCKLITE_DOCKER_SOCKET ?? "/var/run/docker.sock";

type MutableMockState = {
  containers: ContainerSummary[];
  images: ImageSummary[];
  volumes: VolumeSummary[];
  networks: NetworkSummary[];
};

type DockerNetworkStats = {
  rx_bytes?: number;
  tx_bytes?: number;
};

type DockerStatsSnapshot = {
  cpu_stats: {
    cpu_usage: {
      total_usage: number;
      percpu_usage?: number[];
    };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: {
      total_usage: number;
    };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage?: number;
    limit?: number;
    stats?: {
      cache?: number;
      inactive_file?: number;
    };
  };
  networks?: Record<string, DockerNetworkStats>;
};

type DockerInspectPortBinding = {
  HostIp?: string;
  HostPort?: string;
} | null;

type DockerInspectInfo = {
  Id: string;
  Name: string;
  Config: {
    Image: string;
    Labels?: Record<string, string>;
  };
  State?: {
    Status?: string;
    StartedAt?: string;
  };
  NetworkSettings: {
    Ports?: Record<string, DockerInspectPortBinding[] | null>;
  };
  Mounts?: Array<{
    Source?: string;
    Destination?: string;
    Type?: string;
    RW?: boolean;
    Propagation?: string;
  }>;
  Created?: string;
};

type DestroyableStream = NodeJS.ReadWriteStream & {
  destroy?: () => void;
};

const ANSI_ESCAPE_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");

function cloneMockState(): MutableMockState {
  return {
    containers: structuredClone(mockContainers),
    images: structuredClone(mockImages),
    volumes: structuredClone(mockVolumes),
    networks: structuredClone(mockNetworks),
  };
}

function normalizeContainerName(name: string) {
  return name.replace(/^\//, "");
}

/**
 * The Docker API returns `CreatedAt` for volumes but `@types/dockerode`'s
 * `VolumeInspectInfo` does not declare it, so read it defensively rather than
 * stamping "now" on every volume (M6 in CODE-AUDIT.md). Engines that omit the
 * field fall back to the current time, which is what the old code always did.
 */
export function readVolumeCreatedAt(volume: object): string {
  if ("CreatedAt" in volume && typeof volume.CreatedAt === "string" && volume.CreatedAt.trim()) {
    return volume.CreatedAt;
  }

  return new Date().toISOString();
}

/**
 * Split an image reference into repository + tag.
 *
 * A naive `split(":")` breaks on the two references that legitimately contain
 * a colon inside the repository part (M5 in CODE-AUDIT.md):
 *   - a registry port:  `registry.example.com:5000/app`  (no tag at all)
 *   - a digest:         `alpine@sha256:abc…`
 * The tag separator is only the last `:` that appears *after* the last `/`.
 */
export function parseImageReference(reference: string): { repository: string; tag: string } {
  const trimmed = reference.trim();
  const digestSeparator = trimmed.indexOf("@");

  if (digestSeparator !== -1) {
    return { repository: trimmed.slice(0, digestSeparator), tag: trimmed.slice(digestSeparator + 1) };
  }

  const tagSeparator = trimmed.lastIndexOf(":");

  if (tagSeparator > trimmed.lastIndexOf("/")) {
    return { repository: trimmed.slice(0, tagSeparator), tag: trimmed.slice(tagSeparator + 1) };
  }

  return { repository: trimmed, tag: "latest" };
}

/**
 * Label-only project match: the ONLY match a destructive action may use.
 * `com.docker.compose.project` is set by Docker Compose itself and cannot be
 * spoofed by an unrelated container's name.
 */
export function isContainerLabeledForProject(container: { composeProject: string | null }, project: string) {
  return container.composeProject === project;
}

/**
 * Label-or-name-heuristic project match, for non-destructive (start/stop)
 * actions only. The name heuristic (`inferComposeProjectFromName`) can match
 * an unrelated standalone container that merely shares a name prefix, so it
 * must never gate `remove` — see `applyComposeProjectAction`.
 */
export function isContainerInProject(container: { composeProject: string | null; name: string }, project: string) {
  return (
    isContainerLabeledForProject(container, project) ||
    inferComposeProjectFromName(normalizeContainerName(container.name)) === project
  );
}

function getContainerStatus(state?: string, status?: string): ContainerSummary["status"] {
  if (state === "running") {
    return "running";
  }

  if (state === "paused") {
    return "paused";
  }

  if (state === "restarting") {
    return "restarting";
  }

  if (status?.toLowerCase().includes("up")) {
    return "running";
  }

  return "stopped";
}

function createBackendError(error: unknown) {
  if (error instanceof BackendError) {
    return error;
  }

  if (error instanceof Error) {
    return new BackendError(500, "internal_error", error.message);
  }

  return new BackendError(500, "internal_error", "Unexpected backend error");
}

function createContainerNotFoundError(error: unknown) {
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode === 404) {
    return new BackendError(404, "not_found", "Container not found");
  }

  return createBackendError(error);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function isAlreadyInDesiredStateError(error: unknown) {
  const statusCode = (error as { statusCode?: number })?.statusCode;
  return statusCode === 304;
}

function ensureName(value: string, resource: string) {
  if (!value.trim()) {
    throw new BackendError(400, "invalid_request", `${resource} name is required`);
  }
}

async function ensureSocketAccessible(socketPath: string) {
  try {
    await access(socketPath);
  } catch (error) {
    throw new BackendError(
      503,
      "docker_unavailable",
      `Docker socket is not accessible at ${socketPath}`,
      error instanceof Error ? error.message : undefined,
    );
  }
}

function mapInspectMounts(
  mounts: Array<{ Source?: string; Destination?: string; Type?: string; RW?: boolean; Propagation?: string }> | undefined,
): ContainerMountSummary[] {
  return (mounts ?? []).map((mount) => ({
    source: mount.Source ?? "",
    destination: mount.Destination ?? "",
    type: mount.Type ?? "volume",
    readOnly: mount.RW === false,
    propagation: mount.Propagation ? mount.Propagation : null,
  }));
}

function mapInspectPorts(
  ports: Record<string, DockerInspectPortBinding[] | null> | undefined,
): ContainerPortBinding[] {
  return Object.entries(ports ?? {}).flatMap(([containerPort, bindings]) => {
    const [privatePortText, protocolText = "tcp"] = containerPort.split("/");
    const privatePort = Number(privatePortText);
    const protocol = protocolText === "udp" ? "udp" : "tcp";

    if (!bindings || bindings.length === 0) {
      return [{ ip: null, privatePort, publicPort: null, protocol }];
    }

    return bindings.map((binding) => ({
      ip: binding?.HostIp ?? null,
      privatePort,
      publicPort: binding?.HostPort ? Number(binding.HostPort) : null,
      protocol,
    }));
  });
}

function mapInspectLabels(labels: Record<string, string> | undefined): ContainerLabelEntry[] {
  return Object.entries(labels ?? {}).map(([key, value]) => ({ key, value }));
}

function summarizeStats(stats: DockerStatsSnapshot) {
  let cpuPercent = 0;
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;

  if (systemDelta > 0 && cpuDelta > 0) {
    const numCpus = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
    cpuPercent = (cpuDelta / systemDelta) * numCpus * 100.0;
  }

  const usage = stats.memory_stats.usage || 0;
  const cache = stats.memory_stats.stats?.cache || stats.memory_stats.stats?.inactive_file || 0;
  const realUsage = Math.max(0, usage - cache);
  const limit = stats.memory_stats.limit || 0;
  const memoryUsage = formatBytes(realUsage) ?? "0 B";
  const memoryLimit = limit > 0 ? formatBytes(limit) : null;

  let netIO: string | null = null;
  if (stats.networks) {
    let totalRx = 0;
    let totalTx = 0;
    for (const [, networkData] of Object.entries(stats.networks) as Array<[string, DockerNetworkStats]>) {
      totalRx += networkData.rx_bytes || 0;
      totalTx += networkData.tx_bytes || 0;
    }
    const rxMB = totalRx / (1024 * 1024);
    const txMB = totalTx / (1024 * 1024);
    netIO = `↓${rxMB.toFixed(2)} MB ,↑${txMB.toFixed(2)} MB`;
  }

  return {
    cpuPercent: formatPercentage(cpuPercent) ?? 0,
    memoryUsage,
    memoryUsageBytes: realUsage,
    memoryLimit,
    memoryLimitBytes: limit > 0 ? limit : null,
    memPercent: limit > 0 ? formatPercentage((realUsage / limit) * 100.0) ?? 0 : 0,
    netIO,
  };
}

function mapInspectToSummary(details: DockerInspectInfo, stats?: DockerStatsSnapshot): ContainerSummary {
  const inspectDetails = details;
  const summary = mapContainerSummary({
    id: inspectDetails.Id.slice(0, 12),
    name: inspectDetails.Name,
    image: inspectDetails.Config.Image,
    composeProject: inspectDetails.Config.Labels?.["com.docker.compose.project"] ?? null,
    composeService: inspectDetails.Config.Labels?.["com.docker.compose.service"] ?? null,
    state: inspectDetails.State?.Status,
    status: inspectDetails.State?.Status === "running" ? `Up since ${inspectDetails.State.StartedAt}` : inspectDetails.State?.Status,
    ports: Object.entries(inspectDetails.NetworkSettings.Ports ?? {}).flatMap(([containerPort, bindings]) => {
      if (!bindings) {
        const [privatePort, protocol] = containerPort.split("/");
        return [{ PrivatePort: Number(privatePort), Type: protocol }];
      }

      return bindings.map((binding) => ({
        IP: binding?.HostIp,
        PublicPort: Number(binding?.HostPort),
        PrivatePort: Number(containerPort.split("/")[0]),
        Type: containerPort.split("/")[1],
      }));
    }),
    createdAt: inspectDetails.Created,
  });

  if (!stats) {
    return summary;
  }

  const statSummary = summarizeStats(stats);
  return {
    ...summary,
    cpuPercent: statSummary.cpuPercent,
    memUsage: statSummary.memoryUsage,
    memPercent: statSummary.memPercent,
    memLimit: statSummary.memoryLimit,
    netIO: statSummary.netIO,
  };
}

function buildContainerDetailsFromInspect(details: DockerInspectInfo, stats: DockerStatsSnapshot): ContainerDetails {
  const inspectDetails = details;
  const statSummary = summarizeStats(stats);

  return {
    summary: mapInspectToSummary(inspectDetails, stats),
    mounts: mapInspectMounts(inspectDetails.Mounts),
    ports: mapInspectPorts(inspectDetails.NetworkSettings.Ports),
    labels: mapInspectLabels(inspectDetails.Config.Labels),
    inspect: {
      raw: structuredClone(inspectDetails) as Record<string, unknown>,
    },
    stats: [
      {
        sampledAt: new Date().toISOString(),
        cpuPercent: statSummary.cpuPercent,
        memoryUsageBytes: statSummary.memoryUsageBytes,
        memoryLimitBytes: statSummary.memoryLimitBytes,
      },
    ],
  };
}

export function createMockBackend(
  selectedEngineId = "mock",
  socketPath = DEFAULT_SOCKET_PATH,
  endpoint = `unix://${socketPath}`,
): DockerBackend {
  const state = cloneMockState();

  return {
    async getEngineInfo() {
      return {
        ...mockSystemInfo,
        connected: true,
        endpoint,
        selectedEngineId,
        serverTime: new Date().toISOString(),
      };
    },
    async listContainers() {
      return state.containers;
    },
    async getContainerDetails(id) {
      const container = state.containers.find((item) => item.id === id);

      if (!container) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      const details = mockContainerDetails[id];

      if (!details) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      return {
        ...structuredClone(details),
        summary: { ...container },
      };
    },
    async getContainerInspect(id) {
      const details = mockContainerDetails[id];

      if (!details) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      return structuredClone(details.inspect);
    },
    async getContainerStats(id) {
      const details = mockContainerDetails[id];

      if (!details) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      return structuredClone(details.stats);
    },
    async runContainer(payload) {
      const image = payload.image.trim();

      if (!image) {
        throw new BackendError(400, "invalid_request", "Image name is required");
      }

      const newContainer: ContainerSummary = {
        id: randomUUID().slice(0, 12),
        name: payload.name?.trim() || `${image.split(":")[0].split("/").pop()}-${randomUUID().slice(0, 4)}`,
        image,
        composeProject: null,
        composeService: null,
        status: "running",
        state: "Up just now",
        ports: payload.ports
          .filter((port) => port.host && port.container)
          .map((port) => `0.0.0.0:${port.host}->${port.container}/${port.protocol ?? "tcp"}`)
          .join(", "),
        created: new Date().toISOString(),
        cpuPercent: 0,
        memUsage: "0 B",
        memPercent: 0,
        memLimit: "512 MiB",
        netIO: "0 B / 0 B",
        blockIO: "0 B / 0 B",
      };

      state.containers.unshift(newContainer);
      return newContainer;
    },
    async startContainer(id) {
      const container = state.containers.find((item) => item.id === id);

      if (!container) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      container.status = "running";
      container.state = "Up just now";
      return container;
    },
    async stopContainer(id) {
      const container = state.containers.find((item) => item.id === id);

      if (!container) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      container.status = "stopped";
      container.state = "Exited (0) just now";
      return container;
    },
    async restartContainer(id) {
      const container = state.containers.find((item) => item.id === id);

      if (!container) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      container.status = "running";
      container.state = "Up just now";
      return container;
    },
    async rebuildContainer(id) {
      const container = state.containers.find((item) => item.id === id);

      if (!container) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      container.status = "running";
      container.state = "Up just now";
      return container;
    },
    async removeContainer(id) {
      const index = state.containers.findIndex((item) => item.id === id);

      if (index === -1) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      state.containers.splice(index, 1);
    },
    async startComposeProject(project) {
      let hasMatch = false;

      for (const container of state.containers) {
        if (!isContainerInProject(container, project)) {
          continue;
        }

        container.status = "running";
        container.state = "Up just now";
        hasMatch = true;
      }

      if (!hasMatch) {
        throw new BackendError(404, "not_found", `Compose project '${project}' was not found`);
      }
    },
    async stopComposeProject(project) {
      let hasMatch = false;

      for (const container of state.containers) {
        if (!isContainerInProject(container, project)) {
          continue;
        }

        container.status = "stopped";
        container.state = "Exited (0) just now";
        hasMatch = true;
      }

      if (!hasMatch) {
        throw new BackendError(404, "not_found", `Compose project '${project}' was not found`);
      }
    },
    async removeComposeProject(project) {
      const beforeCount = state.containers.length;
      state.containers = state.containers.filter((container) => !isContainerLabeledForProject(container, project));

      if (beforeCount === state.containers.length) {
        throw new BackendError(404, "not_found", `Compose project '${project}' was not found`);
      }
    },
    async subscribeToContainerLogs(id, onChunk) {
      const container = state.containers.find((item) => item.id === id);

      if (!container) {
        throw new BackendError(404, "not_found", "Container not found");
      }

      const sendChunk = (msg: string) =>
        onChunk({
          containerId: container.id,
          lines: [{ time: new Date().toISOString(), msg }],
        });

      sendChunk("Starting application...");
      sendChunk("Listening on 0.0.0.0:3000");

      const interval = setInterval(() => {
        sendChunk(`[INFO] heartbeat ${new Date().toISOString()}`);
      }, 1500);

      return async () => {
        clearInterval(interval);
      };
    },
    async listImages() {
      return state.images;
    },
    async pullImage(payload) {
      const imageName = payload.image.trim();

      if (!imageName) {
        throw new BackendError(400, "invalid_request", "Image name is required");
      }

      const { repository, tag } = parseImageReference(imageName);
      const image: ImageSummary = {
        id: `sha256:${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        repository,
        tag,
        size: "0 B",
        created: formatCreatedDate(new Date().toISOString()),
      };
      state.images.unshift(image);
      return image;
    },
    async removeImage(id) {
      const index = state.images.findIndex((item) => item.id === id);

      if (index === -1) {
        throw new BackendError(404, "not_found", "Image not found");
      }

      state.images.splice(index, 1);
    },
    async listVolumes() {
      return state.volumes;
    },
    async createVolume(payload) {
      ensureName(payload.name, "Volume");
      const volume: VolumeSummary = {
        name: payload.name.trim(),
        driver: "local",
        mountpoint: `/var/lib/docker/volumes/${payload.name.trim()}/_data`,
        created: formatCreatedDate(new Date().toISOString()),
        size: "0 B",
        inUse: false,
      };
      state.volumes.unshift(volume);
      return volume;
    },
    async removeVolume(name) {
      const volume = state.volumes.find((item) => item.name === name);

      if (!volume) {
        throw new BackendError(404, "not_found", "Volume not found");
      }

      if (volume.inUse) {
        throw new BackendError(409, "conflict", "Volume is in use");
      }

      state.volumes = state.volumes.filter((item) => item.name !== name);
    },
    async listNetworks() {
      return state.networks;
    },
    async createNetwork(payload) {
      ensureName(payload.name, "Network");
      const network: NetworkSummary = {
        id: randomUUID().slice(0, 8),
        name: payload.name.trim(),
        driver: payload.driver ?? "bridge",
        scope: "local",
        subnet: "",
        gateway: "",
        containers: 0,
      };
      state.networks.unshift(network);
      return network;
    },
    async execContainer(id: string, cols: number, rows: number) {
      throw new Error("Exec not supported in mock adapter");
    },
    async removeNetwork(id) {
      const network = state.networks.find((item) => item.id === id);

      if (!network) {
        throw new BackendError(404, "not_found", "Network not found");
      }

      if (["bridge", "host", "none"].includes(network.name)) {
        throw new BackendError(409, "conflict", "Default networks cannot be removed");
      }

      state.networks = state.networks.filter((item) => item.id !== id);
    },
  };
}


type ContainerStatsRow = {
  cpuPercent: number;
  memUsage: string | null;
  memPercent: number | null;
  netIO: string | null;
};

async function getStatsMap(runningContainers: Array<{ Id: string }>, docker: Pick<Docker, "getContainer">) {
  const statsMap = new Map<string, ContainerStatsRow>();
  await Promise.all(runningContainers.map(async (container) => {
    try {
      const stats = (await docker.getContainer(container.Id).stats({ stream: false })) as DockerStatsSnapshot;
      
      let cpuPercent = 0;
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      if (systemDelta > 0 && cpuDelta > 0) {
        const numCpus = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
        cpuPercent = (cpuDelta / systemDelta) * numCpus * 100.0;
      }
      
      const usage = stats.memory_stats.usage || 0;
      const cache = stats.memory_stats.stats?.cache || stats.memory_stats.stats?.inactive_file || 0;
      const realUsage = Math.max(0, usage - cache);
      const limit = stats.memory_stats.limit || 0;
      const memUsage: string | null = limit ? `${formatBytes(realUsage)} / ${formatBytes(limit)}` : formatBytes(realUsage);
      
      let memPercent: number | null = null;
      if (limit > 0) {
        memPercent = (realUsage / limit) * 100.0;
      }
      
      let netIO: string | null = null;
      if (stats.networks) {
        let totalRx = 0;
        let totalTx = 0;
        for (const [, networkData] of Object.entries(stats.networks) as Array<[string, DockerNetworkStats]>) {
          totalRx += networkData.rx_bytes || 0;
          totalTx += networkData.tx_bytes || 0;
        }
        const rxMB = totalRx / (1024 * 1024);
        const txMB = totalTx / (1024 * 1024);
        netIO = `↓${rxMB.toFixed(2)} MB ,↑${txMB.toFixed(2)} MB`;
      }
      
      statsMap.set(container.Id, { cpuPercent, memUsage, memPercent, netIO });
    } catch {
      // ignore errors for dead containers
    }
  }));
  return statsMap;
}

function mapContainerSummary(details: {
  id: string;
  name: string;
  image: string;
  composeProject?: string | null;
  composeService?: string | null;
  state?: string;
  status?: string;
  ports?: Array<{ IP?: string; PublicPort?: number; PrivatePort?: number; Type?: string }>;
  createdAt?: string;
}): ContainerSummary {
  return {
    id: details.id,
    name: normalizeContainerName(details.name),
    image: details.image,
    composeProject: details.composeProject ?? null,
    composeService: details.composeService ?? null,
    status: getContainerStatus(details.state, details.status),
    state: details.status ?? details.state ?? "Unknown",
    ports: formatPorts(details.ports),
    created: details.createdAt ?? new Date().toISOString(),
    cpuPercent: null,
    memUsage: null,
    memPercent: null,
    netIO: null,
    memLimit: null,
    blockIO: null,
  };
}

/**
 * Endpoint settings for a recreated container, derived from the inspected one.
 *
 * Runtime-assigned identity (endpoint/network ids, the leased addresses, the
 * MAC) belongs to the container being replaced and must not be re-declared, or
 * the engine rejects the create. Everything the user actually configured
 * (static IPAM, links, aliases, driver options) is carried over.
 */
export function buildEndpointsConfig(details: Docker.ContainerInspectInfo): Docker.EndpointsConfig {
  const shortId = details.Id.slice(0, 12);
  const endpoints: Docker.EndpointsConfig = {};

  for (const [networkName, network] of Object.entries(details.NetworkSettings?.Networks ?? {})) {
    const {
      NetworkID,
      EndpointID,
      Gateway,
      IPAddress,
      IPPrefixLen,
      IPv6Gateway,
      GlobalIPv6Address,
      GlobalIPv6PrefixLen,
      MacAddress,
      Aliases,
      ...configured
    } = network;

    // Docker adds the container's own short id as an alias; re-using it would
    // point the new container's DNS name at an id that is about to disappear.
    const aliases = Array.isArray(Aliases)
      ? Aliases.filter((alias): alias is string => typeof alias === "string" && alias !== shortId)
      : [];

    endpoints[networkName] = aliases.length > 0 ? { ...configured, Aliases: aliases } : { ...configured };
  }

  return endpoints;
}

/**
 * Container `Config` fields the Docker API really returns but
 * `@types/dockerode` does not declare. They are read with `in`-narrowing rather
 * than cast, so a malformed engine response degrades to "absent" instead of
 * lying about its type.
 *
 * These matter on a recreate: a container with a custom `StopSignal` that lost
 * it would be killed with the default signal on its next stop — a silent
 * behaviour change a rebuild must never introduce.
 */
export function readUndeclaredContainerConfig(config: object): {
  StopSignal?: string;
  StopTimeout?: number;
  Shell?: string[];
  OnBuild?: string[];
  MacAddress?: string;
} {
  const toStringArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  const preserved: {
    StopSignal?: string;
    StopTimeout?: number;
    Shell?: string[];
    OnBuild?: string[];
    MacAddress?: string;
  } = {};

  if ("StopSignal" in config && typeof config.StopSignal === "string" && config.StopSignal) {
    preserved.StopSignal = config.StopSignal;
  }

  if ("StopTimeout" in config && typeof config.StopTimeout === "number" && Number.isFinite(config.StopTimeout)) {
    preserved.StopTimeout = config.StopTimeout;
  }

  if ("MacAddress" in config && typeof config.MacAddress === "string" && config.MacAddress) {
    preserved.MacAddress = config.MacAddress;
  }

  if ("Shell" in config) {
    const shell = toStringArray(config.Shell);

    if (shell.length > 0) {
      preserved.Shell = shell;
    }
  }

  if ("OnBuild" in config) {
    const onBuild = toStringArray(config.OnBuild);

    if (onBuild.length > 0) {
      preserved.OnBuild = onBuild;
    }
  }

  return preserved;
}

/**
 * Create options for the replacement container, taken faithfully from the
 * inspected original: its name, image, command/entrypoint, env, labels,
 * exposed ports, stdio flags, healthcheck, stop signal/timeout, the whole
 * `HostConfig` (port bindings, restart policy, binds/mounts, resource limits)
 * and its network attachments.
 *
 * Only the first endpoint can be declared at create time — Docker rejects a
 * create that names more than one — so the caller attaches the rest afterwards.
 */
export function buildRecreateOptions(details: Docker.ContainerInspectInfo, name: string): Docker.ContainerCreateOptions {
  const config = details.Config;
  const shortId = details.Id.slice(0, 12);
  const [firstEndpoint] = Object.entries(buildEndpointsConfig(details));

  return {
    name,
    // An unset hostname defaults to the container's own short id; carrying the
    // old id over would pin the replacement to a dead identity.
    Hostname: config.Hostname === shortId ? undefined : config.Hostname,
    Domainname: config.Domainname,
    User: config.User,
    AttachStdin: config.AttachStdin,
    AttachStdout: config.AttachStdout,
    AttachStderr: config.AttachStderr,
    Tty: config.Tty,
    OpenStdin: config.OpenStdin,
    StdinOnce: config.StdinOnce,
    Env: config.Env,
    Cmd: config.Cmd,
    Entrypoint: config.Entrypoint,
    Image: config.Image,
    Labels: config.Labels,
    Volumes: config.Volumes,
    WorkingDir: config.WorkingDir,
    ExposedPorts: config.ExposedPorts,
    Healthcheck: config.Healthcheck,
    // StopSignal/StopTimeout/Shell/OnBuild/MacAddress — real settings that the
    // dockerode types omit, so they have to be picked up separately.
    ...readUndeclaredContainerConfig(config),
    HostConfig: details.HostConfig,
    NetworkingConfig: firstEndpoint ? { EndpointsConfig: { [firstEndpoint[0]]: firstEndpoint[1] } } : undefined,
  };
}

type DockerClientOptions = ConstructorParameters<typeof Docker>[0];

export async function createDockerBackend(
  dockerOptions: DockerClientOptions,
  endpoint: string,
  selectedEngineId?: string,
): Promise<DockerBackend> {
  if (dockerOptions?.socketPath) {
    await ensureSocketAccessible(dockerOptions.socketPath);
  }

  const docker = new Docker(dockerOptions);

  const listImages = async () => {
    try {
      const images = await docker.listImages();
      return images.map((image) => {
        const { repository, tag } = parseImageReference(image.RepoTags?.[0] ?? "<none>:<none>");
        return {
          id: image.Id,
          repository,
          tag,
          size: formatBytes(image.Size) ?? "unknown",
          created: formatCreatedDate(formatUnixDate(image.Created)),
        };
      });
    } catch (error) {
      throw createBackendError(error);
    }
  };

  async function getContainerSummaryById(id: string) {
    const container = docker.getContainer(id);
    const details = await container.inspect();

    return mapContainerSummary({
      id: details.Id.slice(0, 12),
      name: details.Name,
      image: details.Config.Image,
      composeProject: details.Config.Labels?.["com.docker.compose.project"] ?? null,
      composeService: details.Config.Labels?.["com.docker.compose.service"] ?? null,
      state: details.State.Status,
      status: details.State.Status === "running" ? `Up since ${details.State.StartedAt}` : details.State.Status,
      ports: Object.entries(details.NetworkSettings.Ports ?? {}).flatMap(([containerPort, bindings]) => {
        if (!bindings) {
          const [privatePort, protocol] = containerPort.split("/");
          return [{ PrivatePort: Number(privatePort), Type: protocol }];
        }

        return bindings.map((binding) => ({
          IP: binding.HostIp,
          PublicPort: Number(binding.HostPort),
          PrivatePort: Number(containerPort.split("/")[0]),
          Type: containerPort.split("/")[1],
        }));
      }),
      createdAt: details.Created,
    });
  }

  /**
   * Label-only lookup — the only one `remove` may use (irreversible: force
   * removal must never be triggered by the name heuristic, see H3 in
   * CODE-AUDIT.md).
   */
  async function listLabeledProjectContainers(project: string) {
    const containers = await docker.listContainers({ all: true });
    return containers.filter((container) => (container.Labels?.["com.docker.compose.project"] ?? null) === project);
  }

  /**
   * Label-or-name-heuristic lookup, for non-destructive start/stop only:
   * reversible, and matches what the UI shows grouped under the project.
   */
  async function listProjectContainers(project: string) {
    const containers = await docker.listContainers({ all: true });
    return containers.filter((container) => {
      const labeledProject = container.Labels?.["com.docker.compose.project"] ?? null;
      const inferredProject = inferComposeProjectFromName(
        normalizeContainerName(container.Names?.[0] ?? container.Id.slice(0, 12)),
      );
      return labeledProject === project || inferredProject === project;
    });
  }

  /**
   * `stats({ stream: false })` blocks the daemon for ~1s per container while it
   * computes a CPU delta, and `listContainers` fans one out per running
   * container. Every open browser tab polling the list multiplied that fan-out
   * (M8 in CODE-AUDIT.md), so concurrent and closely-spaced callers share a
   * single result instead.
   *
   * ponytail: fixed-TTL shared cache, not a streaming subscription. Ceiling —
   * rows can be up to STATS_CACHE_TTL_MS stale, and one fan-out per TTL still
   * costs one blocking call per running container; the TTL sits just under the
   * UI's 10s poll so a lone tab still sees fresh numbers every poll. Upgrade
   * path if that is still too much: one long-lived `stats({ stream: true })`
   * subscription per container feeding this same map.
   */
  const STATS_CACHE_TTL_MS = 8_000;
  let cachedStats = new Map<string, ContainerStatsRow>();
  let cachedStatsAt = 0;
  let inFlightStats: Promise<Map<string, ContainerStatsRow>> | null = null;

  async function getCachedStatsMap(runningContainers: Array<{ Id: string }>) {
    if (Date.now() - cachedStatsAt < STATS_CACHE_TTL_MS) {
      return cachedStats;
    }

    inFlightStats ??= getStatsMap(runningContainers, docker)
      .then((stats) => {
        cachedStats = stats;
        cachedStatsAt = Date.now();
        return stats;
      })
      .finally(() => {
        inFlightStats = null;
      });

    return await inFlightStats;
  }

  async function pullImageReference(reference: string) {
    const stream = await docker.pull(reference);
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  /**
   * Undo a failed rebuild: drop the half-built replacement, put the original
   * back under its own name and restart it if it had been running. Returns the
   * first restore failure (if any) so the caller can report it alongside the
   * error that triggered the rollback instead of swallowing either.
   */
  async function restoreOriginalContainer(restore: {
    original: Docker.Container;
    replacement: Docker.Container | null;
    renamed: boolean;
    name: string;
    wasRunning: boolean;
  }): Promise<unknown> {
    let failure: unknown = null;

    const attempt = async (step: () => Promise<unknown>) => {
      try {
        await step();
      } catch (error) {
        if (isAlreadyInDesiredStateError(error)) {
          return;
        }

        failure ??= error;
      }
    };

    if (restore.replacement) {
      const replacement = restore.replacement;
      await attempt(() => replacement.remove({ force: true }));
    }

    if (restore.renamed) {
      await attempt(() => restore.original.rename({ name: restore.name }));
    }

    if (restore.wasRunning) {
      await attempt(() => restore.original.start());
    }

    return failure;
  }

  async function applyComposeProjectAction(project: string, action: "start" | "stop" | "remove") {
    const projectContainers =
      action === "remove" ? await listLabeledProjectContainers(project) : await listProjectContainers(project);

    if (projectContainers.length === 0) {
      throw new BackendError(404, "not_found", `Compose project '${project}' was not found`);
    }

    for (const projectContainer of projectContainers) {
      const container = docker.getContainer(projectContainer.Id);

      try {
        if (action === "start") {
          await container.start();
          continue;
        }

        if (action === "stop") {
          await container.stop();
          continue;
        }

        await container.remove({ force: true });
      } catch (error) {
        if ((action === "start" || action === "stop") && isAlreadyInDesiredStateError(error)) {
          continue;
        }

        throw error;
      }
    }
  }

  return {
    async getEngineInfo() {
      try {
        const [version, info] = await Promise.all([docker.version(), docker.info()]);

        return {
          connected: true,
          dockerVersion: version.Version ?? "unknown",
          apiVersion: version.ApiVersion ?? "unknown",
          os: info.OperatingSystem ?? info.OSType ?? "unknown",
          arch: info.Architecture ?? "unknown",
          kernelVersion: version.KernelVersion ?? "unknown",
          totalMemory: formatBytes(info.MemTotal) ?? "unknown",
          cpus: info.NCPU ?? 0,
          storageDriver: info.Driver ?? "unknown",
          rootDir: info.DockerRootDir ?? "unknown",
          serverTime: new Date().toISOString(),
          endpoint,
          selectedEngineId,
        };
      } catch (error) {
        return {
          connected: false,
          dockerVersion: "unknown",
          apiVersion: "unknown",
          os: "Linux",
          arch: "unknown",
          kernelVersion: "unknown",
          totalMemory: "unknown",
          cpus: 0,
          storageDriver: "unknown",
          rootDir: "unknown",
          serverTime: new Date().toISOString(),
          endpoint,
          selectedEngineId,
          errorMessage: error instanceof Error ? error.message : "Unable to reach Docker Engine",
        };
      }
    },
    async listContainers() {
      try {
        const containers = await docker.listContainers({ all: true });
        const runningContainers = containers.filter(c => c.State === "running");
        const statsMap = await getCachedStatsMap(runningContainers);

        return containers.map((container) => {
          // A cached entry can outlive the container's running state; never
          // report stale CPU/memory numbers against a stopped container.
          const stats = container.State === "running" ? statsMap.get(container.Id) : undefined;
          const summary = mapContainerSummary({
            id: container.Id.slice(0, 12),
            name: container.Names?.[0] ?? container.Id.slice(0, 12),
            image: container.Image,
            composeProject: container.Labels?.["com.docker.compose.project"] ?? null,
            composeService: container.Labels?.["com.docker.compose.service"] ?? null,
            state: container.State,
            status: container.Status,
            ports: container.Ports,
            createdAt: formatUnixDate(container.Created),
          });
          if (stats) {
            summary.cpuPercent = formatPercentage(stats.cpuPercent);
            summary.memUsage = stats.memUsage;
            summary.memPercent = formatPercentage(stats.memPercent);
            summary.netIO = stats.netIO;
          }
          return summary;
        });
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async getContainerDetails(id) {
      try {
        const container = docker.getContainer(id);
        const details = (await container.inspect()) as DockerInspectInfo;
        const stats = (await container.stats({ stream: false })) as DockerStatsSnapshot;
        return buildContainerDetailsFromInspect(details, stats);
      } catch (error) {
        throw createContainerNotFoundError(error);
      }
    },
    async getContainerInspect(id) {
      try {
        const container = docker.getContainer(id);
        const details = (await container.inspect()) as DockerInspectInfo;
        return { raw: structuredClone(details) as Record<string, unknown> };
      } catch (error) {
        throw createContainerNotFoundError(error);
      }
    },
    async getContainerStats(id) {
      try {
        const container = docker.getContainer(id);
        const stats = (await container.stats({ stream: false })) as DockerStatsSnapshot;
        const summary = summarizeStats(stats);
        return [
          {
            sampledAt: new Date().toISOString(),
            cpuPercent: summary.cpuPercent,
            memoryUsageBytes: summary.memoryUsageBytes,
            memoryLimitBytes: summary.memoryLimitBytes,
          },
        ];
      } catch (error) {
        throw createContainerNotFoundError(error);
      }
    },
    async runContainer(payload) {
      if (!payload.image.trim()) {
        throw new BackendError(400, "invalid_request", "Image name is required");
      }

      try {
        const exposedPorts = payload.ports.reduce<Record<string, object>>((ports, port) => {
          if (port.container) {
            ports[`${port.container}/${port.protocol ?? "tcp"}`] = {};
          }

          return ports;
        }, {});

        const portBindings = payload.ports.reduce<Record<string, Array<{ HostIp: string; HostPort: string }>>>((bindings, port) => {
          if (port.host && port.container) {
            bindings[`${port.container}/${port.protocol ?? "tcp"}`] = [{ HostIp: "0.0.0.0", HostPort: port.host }];
          }

          return bindings;
        }, {});

        const container = await docker.createContainer({
          Image: payload.image.trim(),
          name: payload.name?.trim() || undefined,
          Env: payload.envVars.filter((env) => env.key.trim()).map((env) => `${env.key}=${env.value}`),
          ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
          HostConfig: {
            Binds: payload.volumes
              .filter((volume) => volume.source && volume.target)
              .map((volume) => `${volume.source}:${volume.target}${volume.readOnly ? ":ro" : ""}`),
            PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
          },
        });

        await container.start();
        return await getContainerSummaryById(container.id);
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async startContainer(id) {
      try {
        const container = docker.getContainer(id);
        await container.start();
        return await getContainerSummaryById(id);
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async stopContainer(id) {
      try {
        const container = docker.getContainer(id);
        await container.stop();
        return await getContainerSummaryById(id);
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async restartContainer(id) {
      try {
        const container = docker.getContainer(id);
        await container.restart();
        return await getContainerSummaryById(id);
      } catch (error) {
        throw createBackendError(error);
      }
    },
    /**
     * Recreate the container from a freshly pulled image.
     *
     * The order is load-bearing and destructive: inspect → pull → stop →
     * *rename* the original (never remove it) → create the replacement → start
     * it → and only once it is proven startable, remove the renamed original.
     * Any failure before that last step rolls the original back to its own name
     * and running state.
     */
    async rebuildContainer(id) {
      const original = docker.getContainer(id);
      let details: Docker.ContainerInspectInfo;

      try {
        details = await original.inspect();
      } catch (error) {
        throw createContainerNotFoundError(error);
      }

      const name = normalizeContainerName(details.Name);
      const wasRunning = details.State?.Running === true;
      const supersededName = `${name}-docklite-superseded-${Date.now()}`;

      try {
        await pullImageReference(details.Config.Image);
      } catch (error) {
        // A locally built image has nothing to pull from, and failing the whole
        // rebuild for that would be worse than recreating from the image the
        // engine already holds. Registry images still get refreshed.
        console.warn(
          `Rebuild of '${name}': could not pull '${details.Config.Image}', recreating from the local image instead (${getErrorMessage(error)})`,
        );
      }

      let renamed = false;
      let replacement: Docker.Container | null = null;

      try {
        if (wasRunning) {
          await original.stop();
        }

        await original.rename({ name: supersededName });
        renamed = true;

        replacement = await docker.createContainer(buildRecreateOptions(details, name));

        // Only one endpoint may be declared at create time; attach the rest
        // before the container starts so it comes up on every network it had.
        const [, ...remainingEndpoints] = Object.entries(buildEndpointsConfig(details));
        for (const [networkName, endpointConfig] of remainingEndpoints) {
          await docker.getNetwork(networkName).connect({ Container: replacement.id, EndpointConfig: endpointConfig });
        }

        await replacement.start();
      } catch (error) {
        const restoreFailure = await restoreOriginalContainer({ original, replacement, renamed, name, wasRunning });

        if (restoreFailure) {
          throw new BackendError(
            500,
            "rebuild_failed",
            `Rebuild of '${name}' failed (${getErrorMessage(error)}) and the original container could not be fully restored: ${getErrorMessage(restoreFailure)}`,
          );
        }

        throw createBackendError(error);
      }

      try {
        await original.remove({ force: true });
      } catch (error) {
        // The replacement is up and serving; a leftover superseded container is
        // a cleanup problem, not a reason to fail the request.
        console.warn(`Rebuild of '${name}': replacement is running but '${supersededName}' could not be removed (${getErrorMessage(error)})`);
      }

      return await getContainerSummaryById(replacement.id);
    },
    async removeContainer(id) {
      try {
        const container = docker.getContainer(id);
        await container.remove({ force: true });
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async startComposeProject(project) {
      try {
        await applyComposeProjectAction(project, "start");
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async stopComposeProject(project) {
      try {
        await applyComposeProjectAction(project, "stop");
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async removeComposeProject(project) {
      try {
        await applyComposeProjectAction(project, "remove");
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async subscribeToContainerLogs(id, onChunk) {
      try {
        const container = docker.getContainer(id);
        const info = await container.inspect();
        const stream = await container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          timestamps: true,
          tail: 500
        });

        let buffer = "";

        const handleStringData = (text: string) => {
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          const parsedLines = lines
            .filter(Boolean)
            .map((line) => {
              const firstSpace = line.indexOf(" ");
              const rawMsg = (firstSpace === -1 ? line : line.slice(firstSpace + 1)).replace(/\r$/, "");
              return {
                time: firstSpace === -1 ? new Date().toISOString() : line.slice(0, firstSpace),
                msg: rawMsg.replace(ANSI_ESCAPE_SEQUENCE, ""),
              };
            });

          if (parsedLines.length > 0) {
            onChunk({ containerId: id, lines: parsedLines });
          }
        };

        if (info.Config.Tty) {
          (stream as NodeJS.ReadableStream).on("data", (chunk: Buffer) => handleStringData(chunk.toString("utf8")));
        } else {
          
          const outStream = new Writable({
            write(chunk: Buffer, encoding: string, callback: () => void) {
              handleStringData(chunk.toString("utf8"));
              callback();
            }
          });
          docker.modem.demuxStream(stream, outStream, outStream);
        }

        (stream as NodeJS.ReadableStream).on("error", (error: unknown) => {
          onChunk({
            containerId: id,
            lines: [{ time: new Date().toISOString(), msg: `[ERROR] ${getErrorMessage(error)}` }],
          });
        });

        return async () => {
          const destroyableStream = stream as DestroyableStream;
          if (typeof destroyableStream.destroy === "function") {
            destroyableStream.destroy();
          }
        };
      } catch (error) {
        onChunk({
          containerId: id,
          lines: [{ time: new Date().toISOString(), msg: `[ERROR] ${getErrorMessage(error)}` }],
        });
        return async () => {};
      }
    },
    async listImages() {
      return listImages();
    },
    async pullImage(payload) {
      if (!payload.image.trim()) {
        throw new BackendError(400, "invalid_request", "Image name is required");
      }

      const reference = payload.image.trim();

      try {
        await pullImageReference(reference);

        // Resolve the image the engine just stored by the very reference we
        // pulled, rather than scanning `listImages()` for a repository/tag
        // pair. A digest pull produces no matching RepoTag at all, so the scan
        // reported a 500 for a pull that had in fact succeeded (M5).
        const inspected = await docker.getImage(reference).inspect();
        const { repository, tag } = parseImageReference(inspected.RepoTags?.[0] ?? reference);

        return {
          id: inspected.Id,
          repository,
          tag,
          size: formatBytes(inspected.Size) ?? "unknown",
          created: formatCreatedDate(inspected.Created),
        };
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async removeImage(id) {
      try {
        const image = docker.getImage(id);
        await image.remove({ force: true });
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async listVolumes() {
      try {
        const response = await docker.listVolumes();
        return (response.Volumes ?? []).map((volume) => ({
          name: volume.Name,
          driver: volume.Driver,
          mountpoint: volume.Mountpoint,
          created: formatCreatedDate(readVolumeCreatedAt(volume)),
          size: formatBytes(volume.UsageData?.Size) ?? "Unknown",
          inUse: (volume.UsageData?.RefCount ?? 0) > 0,
        }));
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async createVolume(payload) {
      ensureName(payload.name, "Volume");

      try {
        const volume = await docker.createVolume({ Name: payload.name.trim(), Driver: "local" });
        const volumeHandle = docker.getVolume(volume.Name);
        const details = await volumeHandle.inspect();

        return {
          name: details.Name,
          driver: details.Driver,
          mountpoint: details.Mountpoint,
          created: formatCreatedDate(readVolumeCreatedAt(details)),
          size: formatBytes(details.UsageData?.Size) ?? "0 B",
          inUse: (details.UsageData?.RefCount ?? 0) > 0,
        };
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async removeVolume(name) {
      try {
        const volume = docker.getVolume(name);
        await volume.remove();
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async listNetworks() {
      try {
        const networks = await docker.listNetworks();
        return networks.map((network) => ({
          id: network.Id,
          name: network.Name,
          driver: network.Driver,
          scope: network.Scope,
          subnet: network.IPAM?.Config?.[0]?.Subnet ?? "",
          gateway: network.IPAM?.Config?.[0]?.Gateway ?? "",
          containers: Object.keys(network.Containers ?? {}).length,
        }));
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async createNetwork(payload) {
      ensureName(payload.name, "Network");

      try {
        const network = await docker.createNetwork({
          Name: payload.name.trim(),
          Driver: payload.driver ?? "bridge",
        });
        const details = await network.inspect();
        return {
          id: details.Id,
          name: details.Name,
          driver: details.Driver,
          scope: details.Scope,
          subnet: details.IPAM?.Config?.[0]?.Subnet ?? "",
          gateway: details.IPAM?.Config?.[0]?.Gateway ?? "",
          containers: Object.keys(details.Containers ?? {}).length,
        };
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async execContainer(id: string, cols: number, rows: number) {
      try {
        const container = docker.getContainer(id);
        const exec = await container.exec({
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Cmd: ['sh', '-c', 'if command -v bash >/dev/null; then exec bash; else exec sh; fi'],
          Env: ['TERM=xterm'],
        });
        const stream = await exec.start({ stdin: true, hijack: true });
        if (cols && rows) {
          await exec.resize({ w: cols, h: rows });
        }
        return { stream, exec };
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async removeNetwork(id) {
      try {
        const network = docker.getNetwork(id);
        await network.remove();
      } catch (error) {
        throw createBackendError(error);
      }
    },
  };
}

export async function createDockerBackendFromTarget(selectedEngineId: string, socketPath: string) {
  return createDockerBackend({ socketPath }, `unix://${socketPath}`, selectedEngineId);
}

export async function createDockerBackendFromTcpTlsTarget(selectedEngineId: string, target: unknown) {
  const { dockerOptions, endpoint } = await createTcpTlsDockerConnectionConfig(target);
  return createDockerBackend(dockerOptions, endpoint, selectedEngineId);
}

export async function createDockerBackendFromSshTarget(selectedEngineId: string, target: unknown) {
  const { dockerOptions, endpoint } = await createSshDockerConnectionConfig(target);
  return createDockerBackend(dockerOptions, endpoint, selectedEngineId);
}

export async function createDockerBackendFromEnv() {
  if (process.env.DOCKLITE_ADAPTER === "mock") {
    return createMockBackend("system", DEFAULT_SOCKET_PATH);
  }

  return createDockerBackend({ socketPath: DEFAULT_SOCKET_PATH }, `unix://${DEFAULT_SOCKET_PATH}`, "system");
}
