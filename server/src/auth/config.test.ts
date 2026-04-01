import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuthConfigStore,
  DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS,
  DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
} from "./config";

const fixedNow = "2026-04-01T12:00:00.000Z";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "docklite-auth-config-"));
  const authDir = join(dir, "auth");
  const filePath = join(authDir, "auth-config.json");

  return {
    dir,
    authDir,
    filePath,
    store: new AuthConfigStore({
      filePath,
      now: () => fixedNow,
    }),
  };
}

describe("AuthConfigStore", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tmpDirs.length = 0;
  });

  it("boots with setup-required defaults and writes restrictive permissions", async () => {
    const { dir, authDir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    const initial = await store.read();

    expect(initial).toEqual({
      authEnabled: true,
      adminPasswordHash: null,
      passwordUpdatedAt: null,
      passwordVersion: 0,
      sessionIdleTimeoutMinutes: DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
      sessionAbsoluteTimeoutHours: DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS,
      httpsEnabled: false,
      tlsCertPath: null,
      tlsKeyPath: null,
    });
    expect(store.getBootstrapState(initial)).toEqual({
      hasPassword: false,
      requiresBootstrap: true,
      passwordUpdatedAt: null,
      passwordVersion: 0,
    });

    await store.write({
      ...initial,
      adminPasswordHash: "$argon2id$v=19$m=65536,t=3,p=1$hash",
      passwordUpdatedAt: fixedNow,
      passwordVersion: 1,
    });

    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    const dirMode = (await stat(authDir)).mode & 0o777;
    const fileMode = (await stat(filePath)).mode & 0o777;

    expect(raw.adminPasswordHash).toBe("$argon2id$v=19$m=65536,t=3,p=1$hash");
    expect(dirMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
    expect(store.getBootstrapState()).toEqual({
      hasPassword: true,
      requiresBootstrap: false,
      passwordUpdatedAt: fixedNow,
      passwordVersion: 1,
    });
  });

  it("warns or rejects insecure auth storage paths", async () => {
    const { dir, authDir, store } = await createStore();
    tmpDirs.push(dir);

    await store.read();
    await chmod(authDir, 0o770);

    const warnings = await store.inspectStoragePermissions();

    expect(warnings).toEqual([
      expect.objectContaining({
        code: "insecure_path_permissions",
        path: authDir,
      }),
    ]);
    await expect(store.assertStoragePermissions()).rejects.toMatchObject({
      code: "insecure_path_permissions",
    });
  });

  it("warns or rejects insecure TLS private key paths", async () => {
    const { dir, store } = await createStore();
    tmpDirs.push(dir);

    const tlsKeyPath = join(dir, "tls.key");
    await writeFile(tlsKeyPath, "key-data", { mode: 0o666 });
    await chmod(tlsKeyPath, 0o666);

    const warnings = await store.inspectTlsKeyPermissions(tlsKeyPath);

    expect(warnings).toEqual([
      expect.objectContaining({
        code: "insecure_path_permissions",
        path: tlsKeyPath,
      }),
    ]);
    await expect(store.assertTlsKeyPermissions(tlsKeyPath)).rejects.toMatchObject({
      code: "insecure_path_permissions",
    });
  });
});
