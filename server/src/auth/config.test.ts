import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthConfigStore, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "./config";
import { verifyPassword } from "./password";

const fixedNow = "2026-04-03T12:00:00.000Z";

const validStoredConfig = {
  adminUsername: "bootstrap-admin",
  adminPasswordHash: "$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$aGFzaA",
  authVersion: 1,
  jwtSecret: "bootstrap-secret",
  defaultCredentialsActive: false,
  loginRequired: true,
  updatedAt: fixedNow,
};

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
    // The operator supplied a real DOCKLITE_ADMIN_PASSWORD, so the built-in
    // default is not in play.
    expect(initial.defaultCredentialsActive).toBe(false);
    // A fresh install defaults to login-off (local desktop convenience); the
    // loopback bind gate is what actually keeps this safe.
    expect(initial.loginRequired).toBe(false);
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

  it("marks default credentials active only when the seeded password is the built-in default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "docklite-auth-config-"));
    tmpDirs.push(dir);

    const store = new AuthConfigStore({
      filePath: join(dir, "auth", "auth-config.json"),
      now: () => fixedNow,
      env: { DOCKLITE_AUTH_JWT_SECRET: "bootstrap-secret" },
    });

    const config = await store.read();

    expect(config.adminUsername).toBe(DEFAULT_ADMIN_USERNAME);
    expect(config.defaultCredentialsActive).toBe(true);
    await expect(verifyPassword(config.adminPasswordHash, DEFAULT_ADMIN_PASSWORD)).resolves.toBe(true);
  });

  it.each([
    ["not valid JSON", "{ not json"],
    [
      "an empty jwtSecret",
      JSON.stringify({ ...validStoredConfig, jwtSecret: "" }),
    ],
    [
      "a truncated jwtSecret",
      JSON.stringify({ ...validStoredConfig, jwtSecret: "short" }),
    ],
    [
      "a missing adminPasswordHash",
      JSON.stringify({ ...validStoredConfig, adminPasswordHash: undefined }),
    ],
    [
      "an empty adminUsername",
      JSON.stringify({ ...validStoredConfig, adminUsername: "   " }),
    ],
  ])("refuses to load a config with %s instead of falling back to an open session", async (_label, contents) => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");

    await expect(store.read()).rejects.toMatchObject({
      status: 500,
      code: "auth_config_invalid",
    });
  });

  it("recovers from an unusable config once the file is removed", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify({ ...validStoredConfig, jwtSecret: "" }), "utf8");
    await expect(store.read()).rejects.toMatchObject({ code: "auth_config_invalid" });

    await rm(filePath);

    const config = await store.read();

    expect(config.jwtSecret).toBe("bootstrap-secret");
    expect(config.loginRequired).toBe(false);
  });

  it("keeps login required when the stored flag is missing or malformed", async () => {
    const { dir, filePath, store } = await createStore();
    tmpDirs.push(dir);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify({ ...validStoredConfig, loginRequired: "nope" }), "utf8");

    await expect(store.read()).resolves.toMatchObject({ loginRequired: true });
  });

  it("rejects a too-short DOCKLITE_AUTH_JWT_SECRET at seed time", async () => {
    const dir = await mkdtemp(join(tmpdir(), "docklite-auth-config-"));
    tmpDirs.push(dir);

    const store = new AuthConfigStore({
      filePath: join(dir, "auth", "auth-config.json"),
      now: () => fixedNow,
      env: { DOCKLITE_AUTH_JWT_SECRET: "too-short" },
    });

    await expect(store.read()).rejects.toMatchObject({ code: "auth_config_invalid" });
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
