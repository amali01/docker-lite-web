import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { BackendError } from "../types";
import { hashSeedPassword } from "./password";
import { MIN_JWT_SECRET_LENGTH, authConfigSchema } from "./types";
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

function invalidAuthConfig(filePath: string, detail: string): BackendError {
  return new BackendError(
    500,
    "auth_config_invalid",
    `${filePath} is not a usable auth config (${detail}). DockLite will not fall back to an unauthenticated session. ` +
      `Repair the file, or delete it and restart to seed a new one from DOCKLITE_ADMIN_USERNAME / DOCKLITE_ADMIN_PASSWORD.`,
  );
}

function parseAuthConfig(contents: string, filePath: string): AuthConfig {
  let raw: unknown;

  try {
    raw = JSON.parse(contents);
  } catch {
    throw invalidAuthConfig(filePath, "the file is not valid JSON");
  }

  const parsed = authConfigSchema.safeParse(raw);

  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
    throw invalidAuthConfig(filePath, detail);
  }

  return parsed.data;
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

    let contents: string;

    try {
      contents = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      const seeded = await this.write(await this.createInitialConfig());
      this.snapshot = seeded;
      return seeded;
    }

    // An unreadable config is refused, never re-seeded: auto-seeding would
    // reset the admin password to the built-in default, which on a remote
    // instance is a fail-open. The thrown error names the file and the fix.
    const parsed = parseAuthConfig(contents, this.filePath);
    this.snapshot = parsed;
    return parsed;
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
    const envSecret = this.env[DEFAULT_AUTH_JWT_SECRET_ENV_KEY];

    // Reject a too-short env secret here rather than writing a config that
    // read() would refuse on the next boot.
    if (envSecret && envSecret.length < MIN_JWT_SECRET_LENGTH) {
      throw new BackendError(
        500,
        "auth_config_invalid",
        `${DEFAULT_AUTH_JWT_SECRET_ENV_KEY} must be at least ${MIN_JWT_SECRET_LENGTH} characters long.`,
      );
    }

    const jwtSecret = envSecret || randomBytes(32).toString("hex");

    return {
      adminUsername,
      adminPasswordHash: await hashSeedPassword(adminPassword),
      authVersion: 1,
      jwtSecret,
      // Only true when the seeded password really is the built-in default —
      // an operator-supplied DOCKLITE_ADMIN_PASSWORD is not "default".
      defaultCredentialsActive: adminPassword === DEFAULT_ADMIN_PASSWORD,
      // DockLite ships as a local desktop app: a fresh install skips the login
      // wall for zero-friction access. This is honored only on a loopback bind
      // (see runtime `allowAuthBypass`); a network-exposed instance still
      // requires login regardless of this value. Existing configs keep their
      // persisted setting — the `read()` migration stays fail-closed.
      loginRequired: false,
      updatedAt: this.now(),
    };
  }

  private async ensureStorageDirectory(): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }
}
