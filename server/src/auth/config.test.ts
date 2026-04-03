import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthConfigStore } from "./config";
import { verifyPassword } from "./password";

const fixedNow = "2026-04-03T12:00:00.000Z";

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
      env: {
        DOCKLITE_ADMIN_USERNAME: "bootstrap-admin",
        DOCKLITE_ADMIN_PASSWORD: "bootstrap-pass",
        DOCKLITE_AUTH_JWT_SECRET: "bootstrap-secret",
      },
    }),
  };
}

describe("AuthConfigStore", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tmpDirs.length = 0;
  });

  it("creates auth config from env defaults and persists a hashed password", async () => {
    const { dir, authDir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    const initial = await store.read();

    expect(initial.adminUsername).toBe("bootstrap-admin");
    expect(initial.defaultCredentialsActive).toBe(true);
    expect(initial.authVersion).toBe(1);
    expect(initial.updatedAt).toBe(fixedNow);
    expect(initial.jwtSecret).toBe("bootstrap-secret");
    expect(initial.adminPasswordHash).toEqual(expect.any(String));
    expect(initial.adminPasswordHash).not.toBe("bootstrap-pass");
    await expect(verifyPassword(initial.adminPasswordHash, "bootstrap-pass")).resolves.toBe(true);

    const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
    const dirMode = (await stat(authDir)).mode & 0o777;
    const fileMode = (await stat(filePath)).mode & 0o777;

    expect(raw.adminUsername).toBe("bootstrap-admin");
    expect(raw.jwtSecret).toBe("bootstrap-secret");
    expect(raw.adminPasswordHash).toEqual(expect.any(String));
    expect(dirMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
  });

  it("prefers the existing config file over env defaults on later reads", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await store.read();
    const secondStore = new AuthConfigStore({
      filePath,
      now: () => fixedNow,
      env: {
        DOCKLITE_ADMIN_USERNAME: "ignored-admin",
        DOCKLITE_ADMIN_PASSWORD: "ignored-pass",
        DOCKLITE_AUTH_JWT_SECRET: "ignored-secret",
      },
    });

    const config = await secondStore.read();

    expect(config.adminUsername).toBe("bootstrap-admin");
    expect(config.jwtSecret).toBe("bootstrap-secret");
    await expect(verifyPassword(config.adminPasswordHash, "bootstrap-pass")).resolves.toBe(true);
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
});
