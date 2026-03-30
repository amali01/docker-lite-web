import { Writable } from "node:stream";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import Docker from "dockerode";
import {
  mockContainers,
  mockImages,
  mockNetworks,
  mockSystemInfo,
  mockVolumes,
} from "../../../src/lib/mock-data";
import {
  ContainerLogsChunk,
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
import { formatBytes, formatCreatedDate, formatPercentage, formatPorts, formatUnixDate } from "../format";

const DEFAULT_SOCKET_PATH = process.env.DOCKLITE_DOCKER_SOCKET ?? "/var/run/docker.sock";

type MutableMockState = {
  containers: ContainerSummary[];
  images: ImageSummary[];
  volumes: VolumeSummary[];
  networks: NetworkSummary[];
};

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

function inferProjectFromName(name: string) {
  const normalizedName = normalizeContainerName(name).replace(/_/g, "-");
  const parts = normalizedName.split("-").filter(Boolean);

  if (parts.length >= 3 && /^\d+$/.test(parts.at(-1) ?? "")) {
    return parts.slice(0, -2).join("-");
  }

  if (parts.length >= 2) {
    return parts.slice(0, -1).join("-");
  }

  return null;
}

function isContainerInProject(container: { composeProject: string | null; name: string }, project: string) {
  return container.composeProject === project || inferProjectFromName(container.name) === project;
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

export function createMockBackend(selectedEngineId = "mock", socketPath = DEFAULT_SOCKET_PATH): DockerBackend {
  const state = cloneMockState();

  return {
    async getEngineInfo() {
      return {
        ...mockSystemInfo,
        connected: true,
        endpoint: `unix://${socketPath}`,
        selectedEngineId,
        serverTime: new Date().toISOString(),
      };
    },
    async listContainers() {
      return state.containers;
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
      state.containers = state.containers.filter((container) => !isContainerInProject(container, project));

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

      const [repository, tag = "latest"] = imageName.split(":");
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


async function getStatsMap(runningContainers: any[], docker: any) {
  const statsMap = new Map();
  await Promise.all(runningContainers.map(async (c: any) => {
    try {
      const stats = await docker.getContainer(c.Id).stats({ stream: false });
      
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
      let memUsage: string | null = limit ? `${formatBytes(realUsage)} / ${formatBytes(limit)}` : formatBytes(realUsage);
      
      statsMap.set(c.Id, { cpuPercent, memUsage });
    } catch (e) {
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
    memLimit: null,
    netIO: null,
    blockIO: null,
  };
}

async function createDockerBackend(socketPath: string, selectedEngineId?: string): Promise<DockerBackend> {
  await ensureSocketAccessible(socketPath);

  const docker = new Docker({ socketPath });

  const listImages = async () => {
    try {
      const images = await docker.listImages();
      return images.map((image) => {
        const tagReference = image.RepoTags?.[0] ?? "<none>:<none>";
        const [repository, tag] = tagReference.split(":");
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

  async function listProjectContainers(project: string) {
    const containers = await docker.listContainers({ all: true });
    return containers.filter((container) => {
      const labeledProject = container.Labels?.["com.docker.compose.project"] ?? null;
      const inferredProject = inferProjectFromName(container.Names?.[0] ?? container.Id.slice(0, 12));
      return labeledProject === project || inferredProject === project;
    });
  }

  async function applyComposeProjectAction(project: string, action: "start" | "stop" | "remove") {
    const projectContainers = await listProjectContainers(project);

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
          endpoint: `unix://${socketPath}`,
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
          endpoint: `unix://${socketPath}`,
          selectedEngineId,
          errorMessage: error instanceof Error ? error.message : "Unable to reach Docker Engine",
        };
      }
    },
    async listContainers() {
      try {
        const containers = await docker.listContainers({ all: true });
        const runningContainers = containers.filter(c => c.State === "running");
        const statsMap = await getStatsMap(runningContainers, docker);
        
        return containers.map((container) => {
          const stats = statsMap.get(container.Id) || {};
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
          if (stats.cpuPercent !== undefined) summary.cpuPercent = formatPercentage(stats.cpuPercent);
          if (stats.memUsage !== undefined) summary.memUsage = stats.memUsage;
          return summary;
        });
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async runContainer(payload) {
      if (!payload.image.trim()) {
        throw new BackendError(400, "invalid_request", "Image name is required");
      }

      try {
        const exposedPorts = payload.ports.reduce<Record<string, {}>>((ports, port) => {
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
                msg: rawMsg.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ""),
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

        (stream as NodeJS.ReadableStream).on("error", (error: any) => {
          onChunk({
            containerId: id,
            lines: [{ time: new Date().toISOString(), msg: `[ERROR] ${error.message}` }],
          });
        });

        return async () => {
          if (typeof (stream as any).destroy === "function") {
            (stream as any).destroy();
          }
        };
      } catch (error: any) {
        onChunk({
          containerId: id,
          lines: [{ time: new Date().toISOString(), msg: `[ERROR] ${error.message}` }],
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

      try {
        const stream = await docker.pull(payload.image.trim());
        await new Promise<void>((resolve, reject) => {
          docker.modem.followProgress(stream, (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });

        const images = await listImages();
        const [repository, tag = "latest"] = payload.image.trim().split(":");
        const pulled = images.find((image) => image.repository === repository && image.tag === tag);

        if (!pulled) {
          throw new BackendError(500, "pull_failed", "Image pulled but was not returned by the engine");
        }

        return pulled;
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
          created: formatCreatedDate(new Date().toISOString()),
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
        const details = (await volumeHandle.inspect()) as any;

        return {
          name: details.Name,
          driver: details.Driver,
          mountpoint: details.Mountpoint,
          created: formatCreatedDate(new Date().toISOString()),
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
  return createDockerBackend(socketPath, selectedEngineId);
}

export async function createDockerBackendFromEnv() {
  if (process.env.DOCKLITE_ADAPTER === "mock") {
    return createMockBackend("system", DEFAULT_SOCKET_PATH);
  }

  return createDockerBackend(DEFAULT_SOCKET_PATH, "system");
}
