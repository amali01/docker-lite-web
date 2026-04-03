import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { BackendError } from "../types";
import { hashSeedPassword } from "./password";
import type { AuthConfig, AuthPathSecurityWarning } from "./types";

export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin";
export const DEFAULT_AUTH_JWT_SECRET_ENV_KEY = "DOCKLITE_AUTH_JWT_SECRET";

export interface AuthConfigStoreOptions {
  filePath?: string;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
}

function normalizeUsername(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : DEFAULT_ADMIN_USERNAME;
}

function normalizePassword(value: string | undefined) {
  return value && value.length > 0 ? value : DEFAULT_ADMIN_PASSWORD;
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

export function getDefaultAuthConfigPath() {
  return process.env.DOCKLITE_AUTH_CONFIG_PATH ?? join(process.cwd(), "server", "data", "auth-config.json");
}

export class AuthConfigStore {
  private readonly filePath: string;
  private readonly now: () => string;
  private readonly env: NodeJS.ProcessEnv;
  private snapshot: AuthConfig | null = null;

  constructor(options: AuthConfigStoreOptions = {}) {
    this.filePath = options.filePath ?? getDefaultAuthConfigPath();
    this.now = options.now ?? (() => new Date().toISOString());
    this.env = options.env ?? process.env;
  }

  async read(): Promise<AuthConfig> {
    if (this.snapshot) {
      return this.snapshot;
    }

    await this.ensureStorageDirectory();

    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as AuthConfig;
      this.snapshot = raw;
      return raw;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const seeded = await this.write(await this.createInitialConfig());
    this.snapshot = seeded;
    return seeded;
  }

  async write(config: AuthConfig): Promise<AuthConfig> {
    await this.ensureStorageDirectory();

    const normalized: AuthConfig = {
      ...config,
      adminUsername: config.adminUsername.trim(),
      updatedAt: this.now(),
    };
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    const payload = JSON.stringify(normalized, null, 2);

    await writeFile(tempPath, `${payload}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.filePath);
    await chmod(this.filePath, 0o600);

    this.snapshot = normalized;
    return normalized;
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

  private async createInitialConfig(): Promise<AuthConfig> {
    const adminUsername = normalizeUsername(this.env.DOCKLITE_ADMIN_USERNAME);
    const adminPassword = normalizePassword(this.env.DOCKLITE_ADMIN_PASSWORD);
    const jwtSecret = this.env[DEFAULT_AUTH_JWT_SECRET_ENV_KEY] || randomBytes(32).toString("hex");

    return {
      adminUsername,
      adminPasswordHash: await hashSeedPassword(adminPassword),
      authVersion: 1,
      jwtSecret,
      defaultCredentialsActive: true,
      updatedAt: this.now(),
    };
  }

  private async ensureStorageDirectory(): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }
}
