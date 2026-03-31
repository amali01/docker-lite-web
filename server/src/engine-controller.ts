import { homedir } from "node:os";
import { access } from "node:fs/promises";
import { EngineTargetStore } from "./engine-targets/store";
import type { EngineTargetProfile, EngineTargetProfileInput } from "./engine-targets/types";
import {
  BackendError,
  CreateEngineTargetPayload,
  DockerBackend,
  EngineTarget,
  EngineTargetHealth,
  TestEngineTargetPayload,
  UpdateEngineTargetPayload,
} from "./types";
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
  private builtInTargets: EngineTargetConfig[];
  private readonly targetStore: EngineTargetStore;
  private currentTargetId: string;
  private backendPromise: Promise<DockerBackend>;

  constructor(targets = getDefaultEngineTargets(), initialTargetId?: string, targetStore?: EngineTargetStore) {
    this.builtInTargets = targets;
    this.targetStore =
      targetStore ??
      new EngineTargetStore({
        builtInTargets: targets.map((target) => ({
          id: target.id,
          label: target.label,
          kind: "local" as const,
          enabled: true,
          lastHealth: {
            status: target.adapter === "mock" ? "healthy" : "unknown",
            message: target.adapter === "mock" ? "Connected" : "Built-in target not tested yet",
            checkedAt: new Date().toISOString(),
          },
          connection: {
            socketPath: target.socketPath,
          },
        })),
      });
    this.currentTargetId = initialTargetId ?? this.resolveInitialTargetId();
    this.backendPromise = this.initializeBackend();
  }

  private resolveInitialTargetId() {
    const explicitSocket = process.env.DOCKLITE_DOCKER_SOCKET;
    if (explicitSocket) {
      const match = this.builtInTargets.find((target) => target.socketPath === explicitSocket);
      if (match) {
        return match.id;
      }
    }

    return this.builtInTargets[0]?.id ?? "system";
  }

  private async initializeBackend() {
    const preferredTarget = await this.targetStore.getTargetProfile(this.currentTargetId);
    if (preferredTarget) {
      await this.targetStore.selectTarget(preferredTarget.id);
      return this.createBackendForTargetId(preferredTarget.id);
    }

    const activeTarget = await this.targetStore.getActiveTargetProfile();
    this.currentTargetId = activeTarget?.id ?? this.resolveInitialTargetId();
    return this.createBackendForTargetId(this.currentTargetId);
  }

  private async createBackendForTargetId(targetId: string) {
    const builtInTarget = this.builtInTargets.find((target) => target.id === targetId);
    if (builtInTarget) {
      if (builtInTarget.adapter === "mock") {
        return createMockBackend(builtInTarget.id, builtInTarget.socketPath);
      }
      return createDockerBackendFromTarget(builtInTarget.id, builtInTarget.socketPath);
    }

    const target = await this.targetStore.getTargetProfile(targetId);
    if (!target) {
      throw new BackendError(404, "not_found", "Selected engine target not found");
    }

    if (target.kind !== "local") {
      throw new BackendError(501, "not_supported", "Remote engine targets are not supported yet");
    }

    if (process.env.DOCKLITE_ADAPTER === "mock") {
      return createMockBackend(target.id, target.connection.socketPath);
    }

    return createDockerBackendFromTarget(target.id, target.connection.socketPath);
  }

  private async currentBackend() {
    return this.backendPromise;
  }

  async listTargets(): Promise<EngineTarget[]> {
    return this.targetStore.listTargets();
  }

  async selectTarget(targetId: string) {
    await this.targetStore.selectTarget(targetId);
    this.currentTargetId = targetId;
    this.backendPromise = this.createBackendForTargetId(targetId);

    return this.getEngineInfo();
  }

  async createTarget(payload: CreateEngineTargetPayload) {
    const target = await this.targetStore.saveTarget(this.toProfileInput(payload));
    return this.getPublicTarget(target.id);
  }

  async updateTarget(targetId: string, payload: UpdateEngineTargetPayload) {
    const existingTarget = await this.targetStore.getTargetProfile(targetId);
    if (!existingTarget) {
      throw new BackendError(404, "not_found", "Engine target not found");
    }
    if (existingTarget.source === "builtin") {
      throw new BackendError(409, "conflict", "Built-in engine targets cannot be edited");
    }

    await this.targetStore.saveTarget(this.toProfileInput(payload, targetId, existingTarget));

    if (targetId === this.currentTargetId) {
      this.backendPromise = this.createBackendForTargetId(targetId);
    }

    return this.getPublicTarget(targetId);
  }

  async deleteTarget(targetId: string) {
    await this.targetStore.deleteTarget(targetId);
    const activeTarget = await this.targetStore.getActiveTargetProfile();
    this.currentTargetId = activeTarget?.id ?? this.resolveInitialTargetId();
    this.backendPromise = this.createBackendForTargetId(this.currentTargetId);
  }

  async testTarget(payload: TestEngineTargetPayload) {
    return this.checkTargetHealth(this.toProfileInput(payload));
  }

  async retestTarget(targetId: string) {
    const target = await this.targetStore.getTargetProfile(targetId);
    if (!target) {
      throw new BackendError(404, "not_found", "Engine target not found");
    }

    const health = await this.checkTargetHealth(target);
    if (target.source === "saved") {
      await this.targetStore.saveTarget({
        ...this.toProfileInput(target),
        lastHealth: health,
      });
    }

    return health;
  }

  private async getPublicTarget(targetId: string) {
    const target = (await this.targetStore.listTargets()).find((item) => item.id === targetId);
    if (!target) {
      throw new BackendError(404, "not_found", "Engine target not found");
    }
    return target;
  }

  private toProfileInput(
    payload: CreateEngineTargetPayload | UpdateEngineTargetPayload | EngineTargetProfile,
    targetId?: string,
    existingTarget?: EngineTargetProfile,
  ): EngineTargetProfileInput {
    if ("connection" in payload) {
      if (payload.kind === "local") {
        return {
          id: payload.id,
          label: payload.label,
          kind: "local",
          enabled: payload.enabled,
          lastHealth: payload.lastHealth,
          connection: {
            socketPath: payload.connection.socketPath,
          },
        };
      }

      if (payload.kind === "ssh") {
        return {
          id: payload.id,
          label: payload.label,
          kind: "ssh",
          enabled: payload.enabled,
          lastHealth: payload.lastHealth,
          connection: {
            host: payload.connection.host,
            port: payload.connection.port,
          },
          ssh: {
            username: payload.ssh.username,
            authMode: payload.ssh.authMode,
            keyPath: payload.ssh.keyPath,
            knownHostsPath: payload.ssh.knownHostsPath,
            dockerHostOverride: payload.ssh.dockerHostOverride,
          },
        };
      }

      return {
        id: payload.id,
        label: payload.label,
        kind: "tcpTls",
        enabled: payload.enabled,
        lastHealth: payload.lastHealth,
        connection: {
          host: payload.connection.host,
          port: payload.connection.port,
        },
        tls: {
          serverName: payload.tls.serverName,
          tlsMode: payload.tls.tlsMode,
          caPath: payload.tls.caPath,
          certPath: payload.tls.certPath,
          keyPath: payload.tls.keyPath,
        },
      };
    }

    if (payload.kind === "local") {
      const socketPath =
        payload.socketPath ?? (existingTarget?.kind === "local" ? existingTarget.connection.socketPath : undefined);
      if (!socketPath) {
        throw new BackendError(400, "validation_error", "Local engine targets require a socket path");
      }

      return {
        id: targetId,
        label: payload.label ?? existingTarget?.label ?? "Local Docker",
        kind: "local",
        enabled: existingTarget?.enabled,
        lastHealth: existingTarget?.lastHealth ?? null,
        connection: {
          socketPath,
        },
      };
    }

    if (payload.kind === "ssh") {
      const base = existingTarget?.kind === "ssh" ? existingTarget : undefined;
      const host = payload.host ?? base?.connection.host;
      const port = payload.port ?? base?.connection.port;
      const username = payload.username ?? base?.ssh.username;
      const authMode = payload.authMode ?? base?.ssh.authMode;

      if (!host || !port || !username || !authMode) {
        throw new BackendError(400, "validation_error", "SSH engine targets require host, port, username, and auth mode");
      }

      return {
        id: targetId,
        label: payload.label ?? existingTarget?.label ?? "SSH Docker",
        kind: "ssh",
        enabled: existingTarget?.enabled,
        lastHealth: existingTarget?.lastHealth ?? null,
        connection: {
          host,
          port,
        },
        ssh: {
          username,
          authMode,
          keyPath: payload.keyPath ?? base?.ssh.keyPath ?? null,
          knownHostsPath: payload.knownHostsPath ?? base?.ssh.knownHostsPath ?? null,
          dockerHostOverride: payload.dockerHostOverride ?? base?.ssh.dockerHostOverride ?? null,
        },
      };
    }

    const base = existingTarget?.kind === "tcpTls" ? existingTarget : undefined;
    const host = payload.host ?? base?.connection.host;
    const port = payload.port ?? base?.connection.port;
    const tlsMode = payload.tlsMode ?? base?.tls.tlsMode;

    if (!host || !port || !tlsMode) {
      throw new BackendError(400, "validation_error", "TCP/TLS engine targets require host, port, and tls mode");
    }

    return {
      id: targetId,
      label: payload.label ?? existingTarget?.label ?? "Remote Docker",
      kind: "tcpTls",
      enabled: existingTarget?.enabled,
      lastHealth: existingTarget?.lastHealth ?? null,
      connection: {
        host,
        port,
      },
      tls: {
        serverName: payload.serverName ?? base?.tls.serverName ?? null,
        tlsMode,
        caPath: payload.caPath ?? base?.tls.caPath ?? null,
        certPath: payload.certPath ?? base?.tls.certPath ?? null,
        keyPath: payload.keyPath ?? base?.tls.keyPath ?? null,
      },
    };
  }

  private async checkTargetHealth(target: EngineTargetProfile | EngineTargetProfileInput): Promise<EngineTargetHealth> {
    const checkedAt = new Date().toISOString();

    if (target.kind === "local") {
      const available =
        process.env.DOCKLITE_ADAPTER === "mock" ? true : await isSocketAvailable(target.connection.socketPath);

      return {
        status: available ? "healthy" : "unhealthy",
        message: available ? "Connected" : "Docker socket not reachable",
        checkedAt,
      };
    }

    if (process.env.DOCKLITE_ADAPTER === "mock") {
      return {
        status: "healthy",
        message: `Mock ${target.kind} connection successful`,
        checkedAt,
      };
    }

    return {
      status: "unknown",
      message: "Remote engine connection testing is not implemented yet",
      checkedAt,
    };
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
  async rebuildContainer(id: string) {
    return (await this.currentBackend()).rebuildContainer(id);
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
  async execContainer(id: string, cols: number, rows: number) {
    return (await this.currentBackend()).execContainer(id, cols, rows);
  }
  async removeNetwork(id: string) {
    return (await this.currentBackend()).removeNetwork(id);
  }
}
