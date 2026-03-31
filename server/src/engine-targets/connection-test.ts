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

    dockerOptions.sshOptions = {
      privateKey: await readFileImpl(target.ssh.keyPath),
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
    return classifySshFailure(error, checkedAt);
  }
}
