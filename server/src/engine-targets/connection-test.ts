import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Agent } from "node:https";
import { homedir } from "node:os";
import { join } from "node:path";
import Docker from "dockerode";
import { BackendError, EngineTargetHealth } from "../types";
import { INSECURE_TCP_CODE, INSECURE_TCP_MESSAGE } from "./schemas";
import { sanitizeHealthMessage } from "./profile";

type DockerOptions = ConstructorParameters<typeof Docker>[0];

/**
 * docker-modem forwards `agent` to http(s).request, which is the only way to
 * reach Node's TLS `servername` (an HTTP Host header does not influence
 * certificate validation). @types/dockerode omits the field.
 */
type DockerConnectionOptions = NonNullable<DockerOptions> & { agent?: Agent };

type ReadFileLike = (path: string) => Promise<Buffer>;
type DockerInfoClient = {
  info(): Promise<unknown>;
};

export type ConnectionTestCode =
  | "connected"
  | "missing_tls_material"
  | "tls_validation_failed"
  | "docker_unavailable"
  | "connection_timeout"
  | "insecure_tcp_not_supported"
  | "invalid_profile"
  | "ssh_auth_failed"
  | "ssh_host_key_rejected"
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
  /** Hard deadline for the probe. Overridable so tests need not wait it out. */
  timeoutMs?: number;
  /** Sink for the distinguishing failure detail that is withheld from the client. */
  logFailure?: (detail: string) => void;
}

/** Connection tests are a probe, not a workload: fail fast instead of hanging on the OS TCP timeout. */
const CONNECTION_TEST_TIMEOUT_MS = 5_000;

/**
 * Single client-facing message for every failure that depends on the remote
 * side. `POST /api/engine/targets/test` aims connections at operator-supplied
 * host:port pairs, so distinguishable outcomes (refused vs. filtered vs. TLS
 * error) would turn it into an internal port scanner. The real reason is logged
 * server-side instead.
 */
const GENERIC_FAILURE_MESSAGE = "Could not reach a Docker Engine at this address. Check the host, port, and credentials.";

/**
 * Failure codes whose message describes the operator's own submitted profile or
 * local material rather than the remote network, and may therefore be shown.
 */
const SELF_DESCRIBING_CODES: ReadonlySet<ConnectionTestCode> = new Set<ConnectionTestCode>([
  "connected",
  "missing_tls_material",
  INSECURE_TCP_CODE,
  "unsupported_ssh_configuration",
  "ssh_host_key_rejected",
]);

class ConnectionTimeoutError extends Error {}

function withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    operation,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ConnectionTimeoutError("Docker Engine did not respond before the deadline")), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
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

/**
 * Withhold the distinguishing detail from the client while keeping it for the
 * operator's own logs. Runs after redaction, so the log never carries a
 * credential path either.
 */
function withNormalizedFailure(result: ConnectionTestResult, logFailure: (detail: string) => void): ConnectionTestResult {
  if (SELF_DESCRIBING_CODES.has(result.code)) {
    return result;
  }

  logFailure(`[engine-target] connection test failed (${result.code}): ${result.health.message ?? "no detail"}`);

  return {
    ...result,
    health: {
      ...result.health,
      message: GENERIC_FAILURE_MESSAGE,
    },
  };
}

const HOST_KEY_MESSAGES = {
  unreadableKnownHosts:
    "SSH host key verification requires a readable known_hosts file. Set a known hosts path on this target, or add the host to the server user's default known_hosts.",
  mismatch:
    "Host key verification failed: the server presented a host key that does not match its known_hosts entry. This can mean a man-in-the-middle attack. Confirm the new key out of band before updating known_hosts.",
  unknown:
    "Host key verification failed: this host is not listed in known_hosts. Add its key (for example with ssh-keyscan) before connecting.",
  revoked: "Host key verification failed: the host key presented by the server is marked revoked in known_hosts.",
} as const;

type HostKeyVerdict = keyof typeof HOST_KEY_MESSAGES | "match";

function defaultKnownHostsPath() {
  return join(homedir(), ".ssh", "known_hosts");
}

/** OpenSSH stores non-default ports as `[host]:port`, port 22 as the bare host. */
function knownHostsCandidates(host: string, port: number) {
  return port === 22 ? [host] : [`[${host}]:${port}`];
}

function matchesHostPattern(pattern: string, candidate: string) {
  if (!/[*?]/.test(pattern)) {
    return pattern.toLowerCase() === candidate.toLowerCase();
  }

  // Escape everything a RegExp treats specially except the glob wildcards.
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${source}$`, "i").test(candidate);
}

/** `|1|<base64 salt>|<base64 hmac-sha1>` — OpenSSH's HashKnownHosts format. */
function matchesHashedHost(token: string, candidate: string) {
  const [, version, salt, hash] = token.split("|");
  if (version !== "1" || !salt || !hash) {
    return false;
  }

  return createHmac("sha1", Buffer.from(salt, "base64")).update(candidate).digest("base64") === hash;
}

function hostFieldMatches(field: string, candidates: string[]) {
  let matched = false;

  for (const pattern of field.split(",").filter(Boolean)) {
    if (pattern.startsWith("|")) {
      matched = matched || candidates.some((candidate) => matchesHashedHost(pattern, candidate));
      continue;
    }

    const negated = pattern.startsWith("!");
    const bare = negated ? pattern.slice(1) : pattern;
    if (candidates.some((candidate) => matchesHostPattern(bare, candidate))) {
      if (negated) {
        return false;
      }
      matched = true;
    }
  }

  return matched;
}

/**
 * Verify the key ssh2 presents against known_hosts. The presented buffer is the
 * SSH wire-format public key, i.e. exactly what known_hosts stores base64-encoded,
 * so no key parsing is needed.
 */
export function verifyHostKey(knownHosts: string, host: string, port: number, presentedKey: Buffer): HostKeyVerdict {
  const candidates = knownHostsCandidates(host, port);
  const presented = presentedKey.toString("base64");
  let sawHost = false;
  let matched = false;

  for (const rawLine of knownHosts.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const fields = line.split(/\s+/);
    const marker = fields[0].startsWith("@") ? fields.shift() : undefined;
    const [hostField, , base64Key] = fields;
    if (!hostField || !base64Key) {
      continue;
    }

    // Host certificates would need full CA validation; treat them as not configured.
    if (marker === "@cert-authority" || !hostFieldMatches(hostField, candidates)) {
      continue;
    }

    sawHost = true;
    if (base64Key !== presented) {
      continue;
    }

    if (marker === "@revoked") {
      return "revoked";
    }
    matched = true;
  }

  if (matched) {
    return "match";
  }

  return sawHost ? "mismatch" : "unknown";
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

function classifyTimeout(error: unknown, checkedAt: string): ConnectionTestResult | null {
  if (!(error instanceof ConnectionTimeoutError)) {
    return null;
  }

  return {
    code: "connection_timeout",
    health: {
      status: "unhealthy",
      message: error.message,
      checkedAt,
    },
  };
}

function classifyTcpTlsFailure(error: unknown, checkedAt: string): ConnectionTestResult {
  const timedOut = classifyTimeout(error, checkedAt);
  if (timedOut) {
    return timedOut;
  }

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
  const timedOut = classifyTimeout(error, checkedAt);
  if (timedOut) {
    return timedOut;
  }

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

    const dockerOptions: DockerConnectionOptions = {
      host: target.connection.host,
      port: target.connection.port,
      protocol: "https",
      ca,
      cert,
      key,
    };

    if (target.tls.serverName) {
      // Node checks the certificate against `servername` (and sends it as SNI),
      // which is the point of the field: connect by IP, validate a hostname cert.
      dockerOptions.agent = new Agent({ servername: target.tls.serverName });
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
  const timeoutMs = dependencies.timeoutMs ?? CONNECTION_TEST_TIMEOUT_MS;
  const logFailure = dependencies.logFailure ?? ((detail: string) => console.warn(detail));

  try {
    const { dockerOptions } = await createTcpTlsDockerConnectionConfig(input, dependencies);
    const createDockerClient = dependencies.createDockerClient ?? ((options: DockerOptions) => new Docker(options));
    const docker = createDockerClient({ ...dockerOptions, timeout: timeoutMs });
    await withDeadline(docker.info(), timeoutMs);

    return {
      code: "connected",
      health: {
        status: "healthy",
        message: "Connected",
        checkedAt,
      },
    };
  } catch (error) {
    // Classify on the raw error, redact credential paths, then withhold the
    // distinguishing detail from the client.
    return withNormalizedFailure(withSanitizedHealth(classifyTcpTlsFailure(error, checkedAt), secretPaths), logFailure);
  }
}

export async function createSshDockerConnectionConfig(
  input: unknown,
  dependencies: Pick<ConnectionTestDependencies, "readFile" | "sshAgentPath"> = {},
) {
  const target = normalizeSshTarget(input);
  const readFileImpl = dependencies.readFile ?? readFile;

  // Host keys are always verified. Without a configured known_hosts we fall back
  // to the server user's default file rather than accepting any key, so the
  // "known hosts" control in the UI means what it says.
  let knownHosts: string;
  try {
    knownHosts = (await readFileImpl(target.ssh.knownHostsPath ?? defaultKnownHostsPath())).toString("utf8");
  } catch {
    // The fs error embeds the path; surface the actionable instruction instead.
    throw new BackendError(400, "validation_error", HOST_KEY_MESSAGES.unreadableKnownHosts);
  }

  /** ssh2 gets `verify`; `failure` records *why* it refused, which ssh2's own error does not say. */
  const hostKeyVerification: { failure: string | null; verify: (key: Buffer) => boolean } = {
    failure: null,
    verify: (key) => {
      const verdict = verifyHostKey(knownHosts, target.connection.host, target.connection.port, key);
      hostKeyVerification.failure = verdict === "match" ? null : HOST_KEY_MESSAGES[verdict];
      return verdict === "match";
    },
  };

  const dockerOptions: DockerConnectionOptions = {
    host: target.connection.host,
    port: target.connection.port,
    protocol: "ssh",
    username: target.ssh.username,
    sshOptions: {
      hostVerifier: hostKeyVerification.verify,
    },
  };

  if (target.ssh.authMode === "agent") {
    const agentPath = dependencies.sshAgentPath ?? process.env.SSH_AUTH_SOCK;
    if (!agentPath) {
      throw new BackendError(400, "validation_error", "SSH agent auth requires SSH_AUTH_SOCK or an explicit agent path");
    }

    dockerOptions.sshOptions = {
      ...dockerOptions.sshOptions,
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
      ...dockerOptions.sshOptions,
      privateKey,
    };
  }

  return {
    dockerOptions,
    endpoint: `ssh://${target.ssh.username}@${target.connection.host}`,
    hostKeyVerification,
  };
}

export async function testSshConnection(
  input: unknown,
  dependencies: ConnectionTestDependencies = {},
): Promise<ConnectionTestResult> {
  const checkedAt = new Date().toISOString();
  const secretPaths = collectSecretPathsFromInput(input);
  const timeoutMs = dependencies.timeoutMs ?? CONNECTION_TEST_TIMEOUT_MS;
  const logFailure = dependencies.logFailure ?? ((detail: string) => console.warn(detail));
  let hostKeyFailure: string | null = null;

  try {
    const { dockerOptions, hostKeyVerification } = await createSshDockerConnectionConfig(input, dependencies);
    const createDockerClient = dependencies.createDockerClient ?? ((options: DockerOptions) => new Docker(options));
    const docker = createDockerClient({ ...dockerOptions, timeout: timeoutMs });
    try {
      await withDeadline(docker.info(), timeoutMs);
    } finally {
      hostKeyFailure = hostKeyVerification.failure;
    }

    return {
      code: "connected",
      health: {
        status: "healthy",
        message: "Connected",
        checkedAt,
      },
    };
  } catch (error) {
    // A refused host key surfaces from ssh2 as an opaque transport error; report
    // the reason our verifier recorded instead.
    const result: ConnectionTestResult = hostKeyFailure
      ? { code: "ssh_host_key_rejected", health: { status: "unhealthy", message: hostKeyFailure, checkedAt } }
      : classifySshFailure(error, checkedAt);

    return withNormalizedFailure(withSanitizedHealth(result, secretPaths), logFailure);
  }
}
