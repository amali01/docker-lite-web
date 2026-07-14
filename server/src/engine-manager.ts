import { access } from "node:fs/promises";
import { EngineTargetStore } from "./engine-targets/store";
import type { EngineTargetProfile, EngineTargetProfileInput } from "./engine-targets/types";
import { testSshConnection, testTcpTlsConnection } from "./engine-targets/connection-test";
import {
  BackendError,
  CreateEngineTargetPayload,
  DockerBackend,
  EngineTarget,
  EngineTargetHealth,
  TestEngineTargetPayload,
  UpdateEngineTargetPayload,
} from "./types";
import {
  createDockerBackendFromSshTarget,
  createDockerBackendFromTarget,
  createDockerBackendFromTcpTlsTarget,
  createMockBackend,
} from "./docker/client";

/**
 * The deep half of engine management: owns engine target profiles, backend
 * selection/health, and resolving the currently-active DockerBackend. The
 * /api/engine routes talk to it directly (target lifecycle + getEngineInfo);
 * resource routes cross a per-request BackendResolver that calls
 * getActiveBackend(), so a target switch takes effect on the next request.
 */

type EngineTargetConfig = {
  id: string;
  label: string;
  socketPath: string;
  adapter: "real" | "mock";
};

const DEFAULT_MOCK_SOCKET_PATH = process.env.DOCKLITE_DOCKER_SOCKET ?? "/var/run/docker.sock";

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
  return uniqueTargets([
    {
      id: "system",
      label: "System Docker",
      socketPath: process.env.DOCKLITE_SYSTEM_DOCKER_SOCKET ?? "/var/run/docker.sock",
      adapter: process.env.DOCKLITE_ADAPTER === "mock" ? "mock" : "real",
    },
  ]);
}

export class EngineManager {
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
      if (target.kind === "tcpTls") {
        if (process.env.DOCKLITE_ADAPTER === "mock") {
          const endpoint = `tcp://${target.connection.host}:${target.connection.port}`;
          return createMockBackend(target.id, DEFAULT_MOCK_SOCKET_PATH, endpoint);
        }

        return createDockerBackendFromTcpTlsTarget(target.id, target);
      }

      if (process.env.DOCKLITE_ADAPTER === "mock") {
        const endpoint = `ssh://${target.ssh.username}@${target.connection.host}`;
        return createMockBackend(target.id, DEFAULT_MOCK_SOCKET_PATH, endpoint);
      }

      return createDockerBackendFromSshTarget(target.id, target);
    }

    if (process.env.DOCKLITE_ADAPTER === "mock") {
      return createMockBackend(target.id, target.connection.socketPath);
    }

    return createDockerBackendFromTarget(target.id, target.connection.socketPath);
  }

  /** The currently-selected DockerBackend. Resolves to a new backend after selectTarget/update/delete. */
  async getActiveBackend(): Promise<DockerBackend> {
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

    if (target.kind === "tcpTls") {
      if (process.env.DOCKLITE_ADAPTER === "mock") {
        return {
          status: "healthy",
          message: "Mock tcpTls connection successful",
          checkedAt,
        };
      }

      return (await testTcpTlsConnection(target)).health;
    }

    if (target.kind === "ssh") {
      if (process.env.DOCKLITE_ADAPTER === "mock") {
        return {
          status: "healthy",
          message: "Mock ssh connection successful",
          checkedAt,
        };
      }

      return (await testSshConnection(target)).health;
    }

    return {
      status: "unknown",
      message: "Remote engine connection testing is not implemented yet",
      checkedAt,
    };
  }

  async getEngineInfo() {
    const backend = await this.getActiveBackend();
    const info = await backend.getEngineInfo();
    return {
      ...info,
      selectedEngineId: this.currentTargetId,
    };
  }
}
