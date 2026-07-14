import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { BackendError } from "../types";
import { engineTargetStoreStateSchema, parseEngineTargetProfileInput } from "./schemas";
import { buildProfile, toPublicTarget } from "./profile";
import type {
  EngineTarget,
  EngineTargetProfile,
  EngineTargetProfileInput,
  EngineTargetStoreState,
} from "./types";

export interface EngineTargetStoreOptions {
  filePath?: string;
  builtInTargets?: Array<EngineTargetProfile | EngineTargetProfileInput>;
  now?: () => string;
  idFactory?: () => string;
}

type EngineTargetStoreSnapshot = {
  version: number;
  activeTargetId: string | null;
  savedTargets: EngineTargetProfile[];
};

const ENGINE_TARGET_STORE_VERSION = 2;

function getDefaultFilePath() {
  return join(process.cwd(), "server", "data", "engine-targets.json");
}

function getDefaultBuiltinTargets(now: () => string): EngineTargetProfile[] {
  const timestamp = now();

  return [
    {
      id: "system",
      label: "System Docker",
      kind: "local",
      source: "builtin",
      enabled: true,
      lastHealth: {
        status: "healthy",
        message: "Connected to the local Docker socket",
        checkedAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      connection: {
        socketPath: process.env.DOCKLITE_SYSTEM_DOCKER_SOCKET ?? "/var/run/docker.sock",
      },
    },
  ];
}

function getSeededSavedTargets(now: () => string): EngineTargetProfile[] {
  const timestamp = now();
  const systemSocketPath = process.env.DOCKLITE_SYSTEM_DOCKER_SOCKET ?? "/var/run/docker.sock";
  const desktopSocketPath = process.env.DOCKLITE_DESKTOP_DOCKER_SOCKET ?? join(homedir(), ".docker", "desktop", "docker.sock");

  if (desktopSocketPath === systemSocketPath) {
    return [];
  }

  return [
    {
      id: "desktop-linux",
      label: "Docker Desktop",
      kind: "local",
      source: "saved",
      enabled: true,
      lastHealth: {
        status: "unknown",
        message: "Saved local target not tested yet",
        checkedAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      connection: {
        socketPath: desktopSocketPath,
      },
    },
  ];
}

function cloneTarget<T>(target: T): T {
  return JSON.parse(JSON.stringify(target)) as T;
}

function normalizeBuiltinTarget(
  target: EngineTargetProfile | EngineTargetProfileInput,
  now: () => string,
): EngineTargetProfile {
  const timestamp = now();

  return buildProfile(target, {
    id: target.id ?? randomUUID(),
    source: "builtin",
    enabled: target.enabled ?? true,
    lastHealth: "lastHealth" in target ? target.lastHealth ?? null : null,
    createdAt: "createdAt" in target ? target.createdAt : timestamp,
    updatedAt: "updatedAt" in target ? target.updatedAt : timestamp,
  });
}

function normalizeSavedTarget(
  input: EngineTargetProfileInput,
  existing: EngineTargetProfile | undefined,
  now: () => string,
  idFactory: () => string,
): EngineTargetProfile {
  const timestamp = now();

  return buildProfile(input, {
    id: input.id ?? existing?.id ?? idFactory(),
    source: "saved",
    enabled: input.enabled ?? existing?.enabled ?? true,
    lastHealth: input.lastHealth ?? existing?.lastHealth ?? null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}

export class EngineTargetStore {
  private readonly filePath: string;
  private readonly builtInTargets: EngineTargetProfile[];
  private readonly seededSavedTargets: EngineTargetProfile[];
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private loaded = false;
  private state: EngineTargetStoreSnapshot = {
    version: ENGINE_TARGET_STORE_VERSION,
    activeTargetId: null,
    savedTargets: [],
  };

  constructor(options: EngineTargetStoreOptions = {}) {
    this.filePath = options.filePath ?? getDefaultFilePath();
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.builtInTargets = (options.builtInTargets ?? getDefaultBuiltinTargets(this.now)).map((target) =>
      normalizeBuiltinTarget(target, this.now),
    );
    this.seededSavedTargets = getSeededSavedTargets(this.now);
  }

  private getAllTargets() {
    return [...this.builtInTargets, ...this.state.savedTargets];
  }

  private resolveActiveTargetId() {
    const configured = this.state.activeTargetId;
    if (configured && this.getAllTargets().some((target) => target.id === configured)) {
      return configured;
    }

    return this.getAllTargets()[0]?.id ?? null;
  }

  private snapshot(): EngineTargetStoreSnapshot {
    return {
      version: ENGINE_TARGET_STORE_VERSION,
      activeTargetId: this.resolveActiveTargetId(),
      savedTargets: cloneTarget(this.state.savedTargets),
    };
  }

  private async persistState() {
    const serialized = JSON.stringify(this.snapshot(), null, 2);
    await mkdir(dirname(this.filePath), { recursive: true });

    const tmpPath = `${this.filePath}.${this.idFactory()}.tmp`;
    await writeFile(tmpPath, serialized, "utf8");
    await rename(tmpPath, this.filePath);
  }

  private async loadState() {
    if (this.loaded) {
      return;
    }

    let shouldPersist: boolean;

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = engineTargetStoreStateSchema.parse(JSON.parse(raw)) as EngineTargetStoreState;
      const migratedState = this.migrateLoadedState(parsed);
      shouldPersist = migratedState.version !== parsed.version || migratedState.savedTargets.length !== parsed.savedTargets.length;
      this.state = {
        version: migratedState.version,
        activeTargetId: migratedState.activeTargetId,
        savedTargets: cloneTarget(migratedState.savedTargets),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.state = {
        version: ENGINE_TARGET_STORE_VERSION,
        activeTargetId: this.builtInTargets[0]?.id ?? null,
        savedTargets: cloneTarget(this.seededSavedTargets),
      };
      shouldPersist = true;
    }

    this.loaded = true;

    if (shouldPersist) {
      await this.persistState();
    }
  }

  private migrateLoadedState(parsed: EngineTargetStoreState): EngineTargetStoreSnapshot {
    const legacyActiveTargetId =
      parsed.version === ENGINE_TARGET_STORE_VERSION
        ? parsed.activeTargetId
        : parsed.activeTargetId === "desktop-linux"
          ? this.builtInTargets[0]?.id ?? null
          : parsed.activeTargetId;

    if (parsed.version === ENGINE_TARGET_STORE_VERSION) {
      return {
        version: ENGINE_TARGET_STORE_VERSION,
        activeTargetId: legacyActiveTargetId,
        savedTargets: parsed.savedTargets,
      };
    }

    const nextSavedTargets = [...parsed.savedTargets];

    for (const seededTarget of this.seededSavedTargets) {
      if (!nextSavedTargets.some((target) => target.id === seededTarget.id)) {
        nextSavedTargets.push(cloneTarget(seededTarget));
      }
    }

    return {
      version: ENGINE_TARGET_STORE_VERSION,
      activeTargetId: legacyActiveTargetId,
      savedTargets: nextSavedTargets,
    };
  }

  private getSavedTarget(id: string) {
    return this.state.savedTargets.find((target) => target.id === id);
  }

  private getComposedTarget(id: string) {
    return this.getAllTargets().find((target) => target.id === id);
  }

  async listTargets(): Promise<EngineTarget[]> {
    await this.loadState();
    const activeTargetId = this.resolveActiveTargetId();
    return this.getAllTargets().map((target) => toPublicTarget(target, activeTargetId));
  }

  async getSavedTargets(): Promise<EngineTargetProfile[]> {
    await this.loadState();
    return cloneTarget(this.state.savedTargets);
  }

  async getTargetProfile(targetId: string): Promise<EngineTargetProfile | null> {
    await this.loadState();
    const target = this.getComposedTarget(targetId);
    return target ? cloneTarget(target) : null;
  }

  async getActiveTargetProfile(): Promise<EngineTargetProfile | null> {
    await this.loadState();
    const activeTargetId = this.resolveActiveTargetId();
    const target = activeTargetId ? this.getComposedTarget(activeTargetId) : undefined;
    return target ? cloneTarget(target) : null;
  }

  async saveTarget(input: EngineTargetProfileInput): Promise<EngineTargetProfile> {
    await this.loadState();
    const parsed = parseEngineTargetProfileInput(input);
    const existing = parsed.id ? this.getSavedTarget(parsed.id) : undefined;

    if (parsed.id && this.builtInTargets.some((target) => target.id === parsed.id)) {
      throw new BackendError(409, "conflict", "Built-in engine targets cannot be overwritten");
    }

    const savedTarget = normalizeSavedTarget(parsed, existing, this.now, this.idFactory);
    const nextSavedTargets = existing
      ? this.state.savedTargets.map((target) => (target.id === savedTarget.id ? savedTarget : target))
      : [...this.state.savedTargets, savedTarget];

    this.state = {
      version: ENGINE_TARGET_STORE_VERSION,
      activeTargetId: this.resolveActiveTargetId(),
      savedTargets: nextSavedTargets,
    };

    await this.persistState();
    return cloneTarget(savedTarget);
  }

  async deleteTarget(targetId: string): Promise<void> {
    await this.loadState();

    if (this.builtInTargets.some((target) => target.id === targetId)) {
      throw new BackendError(404, "not_found", "Engine target not found");
    }

    const nextSavedTargets = this.state.savedTargets.filter((target) => target.id !== targetId);
    if (nextSavedTargets.length === this.state.savedTargets.length) {
      throw new BackendError(404, "not_found", "Engine target not found");
    }

    const activeTargetId = this.resolveActiveTargetId();
    const nextActiveTargetId = activeTargetId === targetId ? this.getAllTargets().find((target) => target.id !== targetId)?.id ?? null : activeTargetId;

    this.state = {
      version: ENGINE_TARGET_STORE_VERSION,
      activeTargetId: nextActiveTargetId,
      savedTargets: nextSavedTargets,
    };

    await this.persistState();
  }

  async selectTarget(targetId: string): Promise<EngineTarget> {
    await this.loadState();

    const target = this.getComposedTarget(targetId);
    if (!target) {
      throw new BackendError(404, "not_found", "Engine target not found");
    }

    this.state = {
      version: ENGINE_TARGET_STORE_VERSION,
      activeTargetId: targetId,
      savedTargets: cloneTarget(this.state.savedTargets),
    };

    await this.persistState();
    return toPublicTarget(target, targetId);
  }
}
