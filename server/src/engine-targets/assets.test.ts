import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BackendError } from "../types";
import { EngineTargetAssetStore } from "./assets";

async function createAssetStore() {
  const dir = await mkdtemp(join(tmpdir(), "docklite-engine-target-assets-"));

  return {
    dir,
    store: new EngineTargetAssetStore({
      baseDir: dir,
    }),
  };
}

describe("EngineTargetAssetStore", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tmpDirs.length = 0;
  });

  it("saves uploaded TLS assets into a target-owned directory", async () => {
    const { dir, store } = await createAssetStore();
    tmpDirs.push(dir);

    const refs = await store.saveTlsAssets("prod-server", {
      tlsMode: "mtls",
      ca: {
        originalName: "prod-ca.pem",
        contents: Buffer.from("ca-data"),
      },
      cert: {
        originalName: "prod-cert.pem",
        contents: Buffer.from("cert-data"),
      },
      key: {
        originalName: "prod-key.pem",
        contents: Buffer.from("key-data"),
      },
    });

    expect(refs).toEqual({
      caPath: join(dir, "prod-server", "ca.pem"),
      certPath: join(dir, "prod-server", "cert.pem"),
      keyPath: join(dir, "prod-server", "key.pem"),
    });
    await expect(readFile(refs.caPath!, "utf8")).resolves.toBe("ca-data");
    await expect(readFile(refs.certPath!, "utf8")).resolves.toBe("cert-data");
    await expect(readFile(refs.keyPath!, "utf8")).resolves.toBe("key-data");
  });

  it("replaces old TLS files cleanly when new assets are saved", async () => {
    const { dir, store } = await createAssetStore();
    tmpDirs.push(dir);

    await store.saveTlsAssets("prod-server", {
      tlsMode: "mtls",
      ca: {
        originalName: "prod-ca.pem",
        contents: Buffer.from("ca-data"),
      },
      cert: {
        originalName: "prod-cert.pem",
        contents: Buffer.from("cert-data"),
      },
      key: {
        originalName: "prod-key.pem",
        contents: Buffer.from("key-data"),
      },
    });

    const refs = await store.saveTlsAssets("prod-server", {
      tlsMode: "serverOnly",
      ca: {
        originalName: "replacement-ca.pem",
        contents: Buffer.from("replacement-ca-data"),
      },
    });

    expect(refs).toEqual({
      caPath: join(dir, "prod-server", "ca.pem"),
      certPath: null,
      keyPath: null,
    });
    await expect(readFile(refs.caPath!, "utf8")).resolves.toBe("replacement-ca-data");
    await expect(readdir(join(dir, "prod-server"))).resolves.toEqual(["ca.pem"]);
  });

  it("rejects missing required uploaded files for mtls", async () => {
    const { dir, store } = await createAssetStore();
    tmpDirs.push(dir);

    await expect(
      store.saveTlsAssets("prod-server", {
        tlsMode: "mtls",
        ca: {
          originalName: "prod-ca.pem",
          contents: Buffer.from("ca-data"),
        },
        cert: {
          originalName: "prod-cert.pem",
          contents: Buffer.from("cert-data"),
        },
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      message: expect.stringContaining("client certificate"),
    });
  });

  it("returns file references without file contents", async () => {
    const { dir, store } = await createAssetStore();
    tmpDirs.push(dir);

    const refs = await store.saveTlsAssets("prod-server", {
      tlsMode: "serverOnly",
      ca: {
        originalName: "prod-ca.pem",
        contents: Buffer.from("ca-data"),
      },
    });

    expect(refs).toEqual({
      caPath: join(dir, "prod-server", "ca.pem"),
      certPath: null,
      keyPath: null,
    });
    expect(refs).not.toHaveProperty("ca");
    expect(refs).not.toHaveProperty("cert");
    expect(refs).not.toHaveProperty("key");
    expect(refs).not.toHaveProperty("contents");
  });
});
