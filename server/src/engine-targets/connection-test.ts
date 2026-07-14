import { readFile } from "node:fs/promises";
import Docker from "dockerode";
import { BackendError, EngineTargetHealth } from "../types";
import { INSECURE_TCP_CODE, INSECURE_TCP_MESSAGE } from "./schemas";
import { sanitizeHealthMessage } from "./profile";

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
  | "invalid_profile"
  | "ssh_auth_failed"
  | "ssh_hostname_not_found"
  | "unsupported_ssh_configuration";

export interface ConnectionTestResult {
  code: ConnectionTestCode;
  health: EngineTargetHealth;
}

export interface ConnectionTestDependencies {
  readFile?: ReadFileLike;
  createDockerClient?: (options: DockerOptions) => DockerInfoClient;
  sshAgentPath?: string;
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

type SshTargetShape = {
  kind: "ssh";
  label?: string;
  connection: {
    host: string;
    port: number;
  };
  ssh: {
    username: string;
    authMode: "agent" | "keyFile";
    keyPath?: string | null;
    knownHostsPath?: string | null;
    dockerHostOverride?: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Best-effort extraction of the credential path fields from raw connection-test
 * input, so a failed file read cannot leak them through the returned health
 * message. Value-based redaction is format-agnostic (see sanitizeHealthMessage).
 */
function collectSecretPathsFromInput(input: unknown): string[] {
  if (!isRecord(input)) {
    return [];
  }

  const paths: unknown[] = [];
  if (isRecord(input.ssh)) {
    paths.push(input.ssh.keyPath, input.ssh.knownHostsPath);
  }
  if (isRecord(input.tls)) {
    paths.push(input.tls.caPath, input.tls.certPath, input.tls.keyPath);
  }

  return paths.filter((path): path is string => typeof path === "string" && path.trim().length > 0);
}

function withSanitizedHealth(result: ConnectionTestResult, secretPaths: string[]): ConnectionTestResult {
  if (result.health.message === undefined) {
    return result;
  }

  return {
    ...result,
    health: {
      ...result.health,
      message: sanitizeHealthMessage(result.health.message, secretPaths),
    },
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNullableString(value: unknown) {
  return value == null ? null : readString(value);
}

function normalizeTcpTlsTarget(input: unknown): TcpTlsTargetShape {
  if (isRecord(input) && input.kind === "tcp") {
    throw new BackendError(400, INSECURE_TCP_CODE, INSECURE_TCP_MESSAGE);
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
    if (error.code === INSECURE_TCP_CODE) {
      return {
        code: INSECURE_TCP_CODE,
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

function normalizeSshTarget(input: unknown): SshTargetShape {
  if (!isRecord(input) || input.kind !== "ssh" || !isRecord(input.connection) || !isRecord(input.ssh)) {
    throw new BackendError(400, "validation_error", "SSH Docker target input is invalid");
  }

  const host = readString(input.connection.host);
  const port = typeof input.connection.port === "number" && Number.isInteger(input.connection.port) && input.connection.port > 0
    ? input.connection.port
    : null;
  const username = readString(input.ssh.username);
  const authMode =
    input.ssh.authMode === "agent" || input.ssh.authMode === "keyFile" ? input.ssh.authMode : null;

  if (!host || !port || !username || !authMode) {
    throw new BackendError(400, "validation_error", "SSH Docker targets require host, port, username, and auth mode");
  }

  return {
    kind: "ssh",
    label: readString(input.label) ?? undefined,
    connection: {
      host,
      port,
    },
    ssh: {
      username,
      authMode,
      keyPath: readNullableString(input.ssh.keyPath),
      knownHostsPath: readNullableString(input.ssh.knownHostsPath),
      dockerHostOverride: readNullableString(input.ssh.dockerHostOverride),
    },
  };
}

function classifySshFailure(error: unknown, checkedAt: string): ConnectionTestResult {
  const message = error instanceof Error ? error.message : "Unable to reach Docker Engine";
  const errorCode = (error as { code?: unknown })?.code;

  if (error instanceof BackendError) {
    return {
      code: "unsupported_ssh_configuration",
      health: {
        status: "unhealthy",
        message,
        checkedAt,
      },
    };
  }

  if (errorCode === "ENOTFOUND") {
    return {
      code: "ssh_hostname_not_found",
      health: {
        status: "unhealthy",
        message,
        checkedAt,
      },
    };
  }

  if (/authentication methods failed|permission denied|all configured authentication methods failed/i.test(message)) {
    return {
      code: "ssh_auth_failed",
      health: {
        status: "unhealthy",
        message,
        checkedAt,
      },
    };
  }

  return {
    code: "docker_unavailable",
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
    if (error instanceof BackendError) {
      throw error;
    }

    if ((error as { code?: unknown })?.code === "ENOENT") {
      throw new BackendError(400, "validation_error", "Referenced TLS material could not be found on disk");
    }

    // Other fs errors (e.g. EACCES) embed the path — redact it so backend
    // construction failures cannot leak cert/key paths through the API.
    const message = error instanceof Error ? error.message : "Referenced TLS material could not be read";
    throw new BackendError(
      400,
      "validation_error",
      sanitizeHealthMessage(message, [target.tls.caPath, target.tls.certPath, target.tls.keyPath]),
    );
  }
}

export async function testTcpTlsConnection(
  input: unknown,
  dependencies: ConnectionTestDependencies = {},
): Promise<ConnectionTestResult> {
  const checkedAt = new Date().toISOString();
  const secretPaths = collectSecretPathsFromInput(input);

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
    // Classify on the raw error, then redact credential paths from the message.
    return withSanitizedHealth(classifyTcpTlsFailure(error, checkedAt), secretPaths);
  }
}

export async function createSshDockerConnectionConfig(
  input: unknown,
  dependencies: Pick<ConnectionTestDependencies, "readFile" | "sshAgentPath"> = {},
) {
  const target = normalizeSshTarget(input);
  const readFileImpl = dependencies.readFile ?? readFile;

  const dockerOptions: DockerOptions = {
    host: target.connection.host,
    port: target.connection.port,
    protocol: "ssh",
    username: target.ssh.username,
    sshOptions: {},
  };

  if (target.ssh.authMode === "agent") {
    const agentPath = dependencies.sshAgentPath ?? process.env.SSH_AUTH_SOCK;
    if (!agentPath) {
      throw new BackendError(400, "validation_error", "SSH agent auth requires SSH_AUTH_SOCK or an explicit agent path");
    }

    dockerOptions.sshOptions = {
      agent: agentPath,
    };
  } else {
    if (!target.ssh.keyPath) {
      throw new BackendError(400, "validation_error", "SSH key-file auth requires a private key path");
    }

    let privateKey: Buffer;
    try {
      privateKey = await readFileImpl(target.ssh.keyPath);
    } catch (error) {
      // The fs error embeds the key path — redact it so backend construction
      // failures cannot leak the private-key path through the API.
      const message = error instanceof Error ? error.message : "SSH private key could not be read";
      throw new BackendError(400, "validation_error", sanitizeHealthMessage(message, [target.ssh.keyPath]));
    }

    dockerOptions.sshOptions = {
      privateKey,
    };
  }

  return {
    dockerOptions,
    endpoint: `ssh://${target.ssh.username}@${target.connection.host}`,
  };
}

export async function testSshConnection(
  input: unknown,
  dependencies: ConnectionTestDependencies = {},
): Promise<ConnectionTestResult> {
  const checkedAt = new Date().toISOString();
  const secretPaths = collectSecretPathsFromInput(input);

  try {
    const { dockerOptions } = await createSshDockerConnectionConfig(input, dependencies);
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
    // Classify on the raw error, then redact credential paths from the message.
    return withSanitizedHealth(classifySshFailure(error, checkedAt), secretPaths);
  }
}
