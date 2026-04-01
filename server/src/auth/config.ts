import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { BackendError } from "../types";
import type { AuthBootstrapState, AuthConfig, AuthPathSecurityWarning } from "./types";

export const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 30;
export const DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS = 12;

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  authEnabled: true,
  adminPasswordHash: null,
  passwordUpdatedAt: null,
  passwordVersion: 0,
  sessionIdleTimeoutMinutes: DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
  sessionAbsoluteTimeoutHours: DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS,
  httpsEnabled: false,
  tlsCertPath: null,
  tlsKeyPath: null,
};

export interface AuthConfigStoreOptions {
  filePath?: string;
  now?: () => string;
}

function getDefaultFilePath() {
  return join(process.cwd(), "server", "data", "auth-config.json");
}

function normalizeAuthConfig(input: Partial<AuthConfig>): AuthConfig {
  return {
    authEnabled: input.authEnabled ?? DEFAULT_AUTH_CONFIG.authEnabled,
    adminPasswordHash: input.adminPasswordHash ?? null,
    passwordUpdatedAt: input.passwordUpdatedAt ?? null,
    passwordVersion: input.passwordVersion ?? 0,
    sessionIdleTimeoutMinutes: input.sessionIdleTimeoutMinutes ?? DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
    sessionAbsoluteTimeoutHours: input.sessionAbsoluteTimeoutHours ?? DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS,
    httpsEnabled: input.httpsEnabled ?? DEFAULT_AUTH_CONFIG.httpsEnabled,
    tlsCertPath: input.tlsCertPath ?? null,
    tlsKeyPath: input.tlsKeyPath ?? null,
  };
}

function getInsecureMode(mode: number): number {
  return mode & 0o022;
}

function createPathWarning(path: string, mode: number): AuthPathSecurityWarning {
  return {
    code: "insecure_path_permissions",
    path,
    mode,
    message: `Path ${path} is group- or world-writable`,
  };
}

async function inspectPath(path: string): Promise<AuthPathSecurityWarning[]> {
  try {
    const pathStat = await stat(path);
    const mode = pathStat.mode & 0o777;

    return getInsecureMode(mode) === 0 ? [] : [createPathWarning(path, mode)];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export class AuthConfigStore {
  private readonly filePath: string;
  private readonly now: () => string;
  private snapshot: AuthConfig = DEFAULT_AUTH_CONFIG;

  constructor(options: AuthConfigStoreOptions = {}) {
    this.filePath = options.filePath ?? getDefaultFilePath();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async read(): Promise<AuthConfig> {
    await this.ensureStorageDirectory();

    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<AuthConfig>;
      this.snapshot = normalizeAuthConfig(raw);
      return this.snapshot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.snapshot = DEFAULT_AUTH_CONFIG;
        return this.snapshot;
      }

      throw error;
    }
  }

  async write(config: AuthConfig): Promise<AuthConfig> {
    await this.ensureStorageDirectory();

    const normalized = normalizeAuthConfig(config);
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    const payload = JSON.stringify(
      {
        ...normalized,
        updatedAt: this.now(),
      },
      null,
      2,
    );

    await writeFile(tempPath, `${payload}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.filePath);
    await chmod(this.filePath, 0o600);

    this.snapshot = normalized;

    return this.snapshot;
  }

  getBootstrapState(config: AuthConfig = this.snapshot): AuthBootstrapState {
    return {
      hasPassword: Boolean(config.adminPasswordHash),
      requiresBootstrap: !config.adminPasswordHash,
      passwordUpdatedAt: config.passwordUpdatedAt,
      passwordVersion: config.passwordVersion,
    };
  }

  async inspectStoragePermissions(): Promise<AuthPathSecurityWarning[]> {
    const warnings = await Promise.all([inspectPath(dirname(this.filePath)), inspectPath(this.filePath)]);
    return warnings.flat();
  }

  async assertStoragePermissions(): Promise<void> {
    const warnings = await this.inspectStoragePermissions();

    if (warnings.length > 0) {
      throw new BackendError(500, "insecure_path_permissions", warnings[0].message);
    }
  }

  async inspectTlsKeyPermissions(tlsKeyPath: string | null): Promise<AuthPathSecurityWarning[]> {
    if (!tlsKeyPath) {
      return [];
    }

    return inspectPath(tlsKeyPath);
  }

  async assertTlsKeyPermissions(tlsKeyPath: string | null): Promise<void> {
    const warnings = await this.inspectTlsKeyPermissions(tlsKeyPath);

    if (warnings.length > 0) {
      throw new BackendError(500, "insecure_path_permissions", warnings[0].message);
    }
  }

  private async ensureStorageDirectory(): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }
}
