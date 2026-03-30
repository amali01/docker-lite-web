import { homedir } from "node:os";
import { access } from "node:fs/promises";
import { BackendError, DockerBackend, EngineTarget } from "./types";
import { createDockerBackendFromTarget, createMockBackend } from "./docker/client";

type EngineTargetConfig = {
  id: string;
  label: string;
  socketPath: string;
  adapter: "real" | "mock";
};

async function isSocketAvailable(socketPath: string) {
  try {
    await access(socketPath);
    return true;
  } catch {
    return false;
  }
}

function uniqueTargets(targets: EngineTargetConfig[]) {
  return targets.filter((target, index, all) => all.findIndex((item) => item.socketPath === target.socketPath) === index);
}

export function getDefaultEngineTargets(): EngineTargetConfig[] {
  const home = homedir();
  return uniqueTargets([
    {
      id: "system",
      label: "System Docker",
      socketPath: process.env.DOCKLITE_SYSTEM_DOCKER_SOCKET ?? "/var/run/docker.sock",
      adapter: process.env.DOCKLITE_ADAPTER === "mock" ? "mock" : "real",
    },
    {
      id: "desktop-linux",
      label: "Docker Desktop",
      socketPath: process.env.DOCKLITE_DESKTOP_DOCKER_SOCKET ?? `${home}/.docker/desktop/docker.sock`,
      adapter: process.env.DOCKLITE_ADAPTER === "mock" ? "mock" : "real",
    },
  ]);
}

export class EngineController implements DockerBackend {
  private targets: EngineTargetConfig[];
  private currentTargetId: string;
  private backendPromise: Promise<DockerBackend>;

  constructor(targets = getDefaultEngineTargets(), initialTargetId?: string) {
    this.targets = targets;
    this.currentTargetId = initialTargetId ?? this.resolveInitialTargetId();
    this.backendPromise = this.createBackendForCurrentTarget();
  }

  private resolveInitialTargetId() {
    const explicitSocket = process.env.DOCKLITE_DOCKER_SOCKET;
    if (explicitSocket) {
      const match = this.targets.find((target) => target.socketPath === explicitSocket);
      if (match) {
        return match.id;
      }
    }

    return this.targets[0]?.id ?? "system";
  }

  private getCurrentTargetConfig() {
    const target = this.targets.find((item) => item.id === this.currentTargetId);
    if (!target) {
      throw new BackendError(404, "not_found", "Selected engine target not found");
    }
    return target;
  }

  private async createBackendForCurrentTarget() {
    const target = this.getCurrentTargetConfig();
    if (target.adapter === "mock") {
      return createMockBackend(target.id, target.socketPath);
    }
    return createDockerBackendFromTarget(target.id, target.socketPath);
  }

  private async currentBackend() {
    return this.backendPromise;
  }

  async listTargets(): Promise<EngineTarget[]> {
    const currentId = this.currentTargetId;
    const targets = await Promise.all(
      this.targets.map(async (target) => ({
        id: target.id,
        label: target.label,
        endpoint: `unix://${target.socketPath}`,
        active: target.id === currentId,
        available: target.adapter === "mock" ? true : await isSocketAvailable(target.socketPath),
      })),
    );

    return targets;
  }

  async selectTarget(targetId: string) {
    const target = this.targets.find((item) => item.id === targetId);
    if (!target) {
      throw new BackendError(404, "not_found", "Engine target not found");
    }

    this.currentTargetId = targetId;
    this.backendPromise = this.createBackendForCurrentTarget();

    return this.getEngineInfo();
  }

  async getEngineInfo() {
    const backend = await this.currentBackend();
    const info = await backend.getEngineInfo();
    return {
      ...info,
      selectedEngineId: this.currentTargetId,
    };
  }

  async listContainers() {
    return (await this.currentBackend()).listContainers();
  }
  async runContainer(payload: Parameters<DockerBackend["runContainer"]>[0]) {
    return (await this.currentBackend()).runContainer(payload);
  }
  async startContainer(id: string) {
    return (await this.currentBackend()).startContainer(id);
  }
  async stopContainer(id: string) {
    return (await this.currentBackend()).stopContainer(id);
  }
  async restartContainer(id: string) {
    return (await this.currentBackend()).restartContainer(id);
  }
  async removeContainer(id: string) {
    return (await this.currentBackend()).removeContainer(id);
  }
  async startComposeProject(project: string) {
    return (await this.currentBackend()).startComposeProject(project);
  }
  async stopComposeProject(project: string) {
    return (await this.currentBackend()).stopComposeProject(project);
  }
  async removeComposeProject(project: string) {
    return (await this.currentBackend()).removeComposeProject(project);
  }
  async subscribeToContainerLogs(id: string, onChunk: Parameters<DockerBackend["subscribeToContainerLogs"]>[1]) {
    return (await this.currentBackend()).subscribeToContainerLogs(id, onChunk);
  }
  async listImages() {
    return (await this.currentBackend()).listImages();
  }
  async pullImage(payload: Parameters<DockerBackend["pullImage"]>[0]) {
    return (await this.currentBackend()).pullImage(payload);
  }
  async removeImage(id: string) {
    return (await this.currentBackend()).removeImage(id);
  }
  async listVolumes() {
    return (await this.currentBackend()).listVolumes();
  }
  async createVolume(payload: Parameters<DockerBackend["createVolume"]>[0]) {
    return (await this.currentBackend()).createVolume(payload);
  }
  async removeVolume(name: string) {
    return (await this.currentBackend()).removeVolume(name);
  }
  async listNetworks() {
    return (await this.currentBackend()).listNetworks();
  }
  async createNetwork(payload: Parameters<DockerBackend["createNetwork"]>[0]) {
    return (await this.currentBackend()).createNetwork(payload);
  }
  async removeNetwork(id: string) {
    return (await this.currentBackend()).removeNetwork(id);
  }
}
