import { readFile } from "node:fs/promises";
import Docker from "dockerode";
import { BackendError, EngineTargetHealth } from "../types";

type DockerOptions = ConstructorParameters<typeof Docker>[0];

type ReadFileLike = (path: string) => Promise<Buffer>;
type DockerInfoClient = {
  info(): Promise<unknown>;
};

export type ConnectionTestCode =
  | "connected"
  | "missing_tls_material"
  | "tls_validation_failed"
  | "docker_unavailable"
  | "insecure_tcp_not_supported"
  | "invalid_profile";

export interface ConnectionTestResult {
  code: ConnectionTestCode;
  health: EngineTargetHealth;
}

export interface ConnectionTestDependencies {
  readFile?: ReadFileLike;
  createDockerClient?: (options: DockerOptions) => DockerInfoClient;
}

type TcpTlsTargetShape = {
  kind: "tcpTls";
  label?: string;
  connection: {
    host: string;
    port: number;
  };
  tls: {
    serverName?: string | null;
    tlsMode: "serverOnly" | "mtls";
    caPath?: string | null;
    certPath?: string | null;
    keyPath?: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNullableString(value: unknown) {
  return value == null ? null : readString(value);
}

function normalizeTcpTlsTarget(input: unknown): TcpTlsTargetShape {
  if (isRecord(input) && input.kind === "tcp") {
    throw new BackendError(400, "validation_error", "Plain TCP Docker targets are not supported. Use tcpTls instead.");
  }

  if (!isRecord(input) || input.kind !== "tcpTls" || !isRecord(input.connection) || !isRecord(input.tls)) {
    throw new BackendError(400, "validation_error", "TCP/TLS Docker target input is invalid");
  }

  const host = readString(input.connection.host);
  const port = typeof input.connection.port === "number" && Number.isInteger(input.connection.port) && input.connection.port > 0
    ? input.connection.port
    : null;
  const tlsMode =
    input.tls.tlsMode === "serverOnly" || input.tls.tlsMode === "mtls" ? input.tls.tlsMode : null;

  if (!host || !port || !tlsMode) {
    throw new BackendError(400, "validation_error", "TCP/TLS Docker targets require host, port, and tls mode");
  }

  return {
    kind: "tcpTls",
    label: readString(input.label) ?? undefined,
    connection: {
      host,
      port,
    },
    tls: {
      serverName: readNullableString(input.tls.serverName),
      tlsMode,
      caPath: readNullableString(input.tls.caPath),
      certPath: readNullableString(input.tls.certPath),
      keyPath: readNullableString(input.tls.keyPath),
    },
  };
}

function classifyTcpTlsFailure(error: unknown, checkedAt: string): ConnectionTestResult {
  const message = error instanceof Error ? error.message : "Unable to reach Docker Engine";
  const errorCode = (error as { code?: unknown })?.code;

  if (error instanceof BackendError) {
    if (message.includes("Plain TCP Docker targets are not supported")) {
      return {
        code: "insecure_tcp_not_supported",
        health: {
          status: "unhealthy",
          message,
          checkedAt,
        },
      };
    }

    return {
      code: "missing_tls_material",
      health: {
        status: "unhealthy",
        message,
        checkedAt,
      },
    };
  }

  if (
    typeof errorCode === "string" &&
    ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT", "ECONNRESET"].includes(errorCode)
  ) {
    return {
      code: "docker_unavailable",
      health: {
        status: "unhealthy",
        message,
        checkedAt,
      },
    };
  }

  if (/certificate|altnames|hostname\/ip|self signed|unable to verify/i.test(message)) {
    return {
      code: "tls_validation_failed",
      health: {
        status: "unhealthy",
        message,
        checkedAt,
      },
    };
  }

  return {
    code: "invalid_profile",
    health: {
      status: "unhealthy",
      message,
      checkedAt,
    },
  };
}

export async function createTcpTlsDockerConnectionConfig(
  input: unknown,
  dependencies: Pick<ConnectionTestDependencies, "readFile"> = {},
) {
  const target = normalizeTcpTlsTarget(input);
  const readFileImpl = dependencies.readFile ?? readFile;

  if (!target.tls.caPath) {
    throw new BackendError(400, "validation_error", "TCP/TLS targets require a CA certificate");
  }

  if (target.tls.tlsMode === "mtls" && (!target.tls.certPath || !target.tls.keyPath)) {
    throw new BackendError(400, "validation_error", "mTLS targets require both a client certificate and private key");
  }

  try {
    const ca = await readFileImpl(target.tls.caPath);
    const cert = target.tls.certPath ? await readFileImpl(target.tls.certPath) : undefined;
    const key = target.tls.keyPath ? await readFileImpl(target.tls.keyPath) : undefined;

    const dockerOptions: DockerOptions = {
      host: target.connection.host,
      port: target.connection.port,
      protocol: "https",
      ca,
      cert,
      key,
    };

    if (target.tls.serverName) {
      dockerOptions.headers = {
        host: target.tls.serverName,
      };
    }

    return {
      dockerOptions,
      endpoint: `tcp://${target.connection.host}:${target.connection.port}`,
    };
  } catch (error) {
    if ((error as { code?: unknown })?.code === "ENOENT") {
      throw new BackendError(400, "validation_error", "Referenced TLS material could not be found on disk");
    }

    throw error;
  }
}

export async function testTcpTlsConnection(
  input: unknown,
  dependencies: ConnectionTestDependencies = {},
): Promise<ConnectionTestResult> {
  const checkedAt = new Date().toISOString();

  try {
    const { dockerOptions } = await createTcpTlsDockerConnectionConfig(input, dependencies);
    const createDockerClient = dependencies.createDockerClient ?? ((options: DockerOptions) => new Docker(options));
    const docker = createDockerClient(dockerOptions);
    await docker.info();

    return {
      code: "connected",
      health: {
        status: "healthy",
        message: "Connected",
        checkedAt,
      },
    };
  } catch (error) {
    return classifyTcpTlsFailure(error, checkedAt);
  }
}
