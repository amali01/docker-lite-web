import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BackendError } from "../types";

const targetIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

export interface UploadedTlsAsset {
  originalName: string;
  contents: Buffer;
}

export interface SaveTlsAssetsInput {
  tlsMode: "serverOnly" | "mtls";
  ca?: UploadedTlsAsset;
  cert?: UploadedTlsAsset;
  key?: UploadedTlsAsset;
}

export interface TlsAssetRefs {
  caPath: string | null;
  certPath: string | null;
  keyPath: string | null;
}

export interface EngineTargetAssetStoreOptions {
  baseDir?: string;
}

function getDefaultBaseDir() {
  return join(process.cwd(), "server", "data", "engine-target-assets");
}

function assertValidTargetId(targetId: string) {
  if (!targetIdPattern.test(targetId)) {
    throw new BackendError(400, "validation_error", "Engine target asset paths require a safe target id");
  }
}

function assertValidAsset(asset: UploadedTlsAsset, label: string) {
  if (!asset.originalName.trim()) {
    throw new BackendError(400, "validation_error", `${label} filename is required`);
  }

  if (!Buffer.isBuffer(asset.contents) || asset.contents.length === 0) {
    throw new BackendError(400, "validation_error", `${label} contents are required`);
  }
}

async function writeAsset(path: string, asset: UploadedTlsAsset) {
  assertValidAsset(asset, asset.originalName);
  await writeFile(path, asset.contents, { mode: 0o600 });
}

export class EngineTargetAssetStore {
  private readonly baseDir: string;

  constructor(options: EngineTargetAssetStoreOptions = {}) {
    this.baseDir = options.baseDir ?? getDefaultBaseDir();
  }

  private getTargetDir(targetId: string) {
    assertValidTargetId(targetId);
    return join(this.baseDir, targetId);
  }

  async saveTlsAssets(targetId: string, input: SaveTlsAssetsInput): Promise<TlsAssetRefs> {
    if (input.tlsMode === "mtls" && (!input.cert || !input.key)) {
      throw new BackendError(400, "validation_error", "mTLS targets require both a client certificate and private key");
    }

    const targetDir = this.getTargetDir(targetId);

    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true, mode: 0o700 });

    const refs: TlsAssetRefs = {
      caPath: null,
      certPath: null,
      keyPath: null,
    };

    if (input.ca) {
      refs.caPath = join(targetDir, "ca.pem");
      await writeAsset(refs.caPath, input.ca);
    }

    if (input.cert) {
      refs.certPath = join(targetDir, "cert.pem");
      await writeAsset(refs.certPath, input.cert);
    }

    if (input.key) {
      refs.keyPath = join(targetDir, "key.pem");
      await writeAsset(refs.keyPath, input.key);
    }

    return refs;
  }

  async deleteTargetAssets(targetId: string): Promise<void> {
    await rm(this.getTargetDir(targetId), { recursive: true, force: true });
  }
}
