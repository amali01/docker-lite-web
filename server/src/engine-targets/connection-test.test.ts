import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createSshDockerConnectionConfig,
  createTcpTlsDockerConnectionConfig,
  testSshConnection,
  testTcpTlsConnection,
  verifyHostKey,
} from "./connection-test";

const HOST_KEY = Buffer.from("host-key-blob");
const OTHER_KEY = Buffer.from("impostor-key-blob");
const KNOWN_HOSTS = `# comment\nprod.example.internal ssh-ed25519 ${HOST_KEY.toString("base64")} operator@laptop\n`;

/** known_hosts fixture for any path the code asks for. */
const knownHostsReader = (contents = KNOWN_HOSTS) => vi.fn(async () => Buffer.from(contents));

/**
 * ssh2 types `hostVerifier` as a union of four verifier shapes, so narrow to the
 * synchronous key-buffer form before driving it from a test double.
 */
function asSyncHostVerifier(candidate: unknown): (key: Buffer) => boolean {
  if (typeof candidate !== "function") {
    throw new Error("no host verifier was installed on the SSH options");
  }

  const verifier: (key: Buffer) => boolean = (key) => Boolean(Reflect.apply(candidate, undefined, [key]));
  return verifier;
}

describe("testTcpTlsConnection", () => {
  it("reports a healthy TLS-backed target", async () => {
    const info = vi.fn().mockResolvedValue({ ID: "daemon" });
    const createDockerClient = vi.fn().mockReturnValue({ info });
    const readFile = vi.fn(async (path: string) => Buffer.from(`contents:${path}`));

    const result = await testTcpTlsConnection(
      {
        kind: "tcpTls",
        label: "Prod TLS Docker",
        connection: {
          host: "prod.example.internal",
          port: 2376,
        },
        tls: {
          tlsMode: "mtls",
          serverName: "prod.example.internal",
          caPath: "/tmp/prod-ca.pem",
          certPath: "/tmp/prod-cert.pem",
          keyPath: "/tmp/prod-key.pem",
        },
      },
      {
        readFile,
        createDockerClient,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        code: "connected",
        health: expect.objectContaining({
          status: "healthy",
        }),
      }),
    );
    expect(createDockerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "prod.example.internal",
        port: 2376,
        protocol: "https",
        ca: Buffer.from("contents:/tmp/prod-ca.pem"),
        cert: Buffer.from("contents:/tmp/prod-cert.pem"),
        key: Buffer.from("contents:/tmp/prod-key.pem"),
      }),
    );
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("reports missing mTLS material", async () => {
    const result = await testTcpTlsConnection({
      kind: "tcpTls",
      label: "Prod TLS Docker",
      connection: {
        host: "prod.example.internal",
        port: 2376,
      },
      tls: {
        tlsMode: "mtls",
        serverName: "prod.example.internal",
        caPath: "/tmp/prod-ca.pem",
        certPath: null,
        keyPath: null,
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        code: "missing_tls_material",
        health: expect.objectContaining({
          status: "unhealthy",
        }),
      }),
    );
  });

  it("classifies certificate mismatch failures", async () => {
    const result = await testTcpTlsConnection(
      {
        kind: "tcpTls",
        label: "Prod TLS Docker",
        connection: {
          host: "prod.example.internal",
          port: 2376,
        },
        tls: {
          tlsMode: "serverOnly",
          serverName: "prod.example.internal",
          caPath: "/tmp/prod-ca.pem",
          certPath: null,
          keyPath: null,
        },
      },
      {
        readFile: vi.fn(async () => Buffer.from("contents")),
        createDockerClient: vi.fn().mockReturnValue({
          info: vi
            .fn()
            .mockRejectedValue(new Error("Hostname/IP does not match certificate's altnames: Host: prod.example.internal")),
        }),
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        code: "tls_validation_failed",
        health: expect.objectContaining({
          status: "unhealthy",
        }),
      }),
    );
  });

  it("preserves TLS classification while redacting the cert path from the logged detail", async () => {
    const logFailure = vi.fn();
    const result = await testTcpTlsConnection(
      {
        kind: "tcpTls",
        label: "Prod TLS Docker",
        connection: { host: "prod.example.internal", port: 2376 },
        tls: { tlsMode: "serverOnly", serverName: "prod.example.internal", caPath: "/secure/ca.pem", certPath: null, keyPath: null },
      },
      {
        readFile: vi.fn(async () => Buffer.from("contents")),
        createDockerClient: vi.fn().mockReturnValue({
          info: vi.fn().mockRejectedValue(new Error("certificate problem at /secure/ca.pem: unable to verify first certificate")),
        }),
        logFailure,
      },
    );

    // classification still runs on the raw message (contains "certificate"/"unable to verify")
    expect(result.code).toBe("tls_validation_failed");
    // the client sees nothing specific...
    expect(result.health.message).not.toContain("/secure/ca.pem");
    expect(result.health.message).not.toContain("certificate");
    // ...and even the server-side detail has the cert path redacted
    const [detail] = logFailure.mock.calls[0];
    expect(detail).toContain("unable to verify first certificate");
    expect(detail).not.toContain("/secure/ca.pem");
    expect(detail).toContain("<path>");
  });

  it("validates the certificate against serverName instead of an HTTP Host header", async () => {
    const createDockerClient = vi.fn().mockReturnValue({ info: vi.fn().mockResolvedValue({ ID: "daemon" }) });

    await testTcpTlsConnection(
      {
        kind: "tcpTls",
        label: "Prod TLS Docker",
        connection: { host: "10.0.0.4", port: 2376 },
        tls: { tlsMode: "serverOnly", serverName: "prod.example.internal", caPath: "/tmp/ca.pem", certPath: null, keyPath: null },
      },
      { readFile: vi.fn(async () => Buffer.from("contents")), createDockerClient },
    );

    const [options] = createDockerClient.mock.calls[0];
    expect(options.agent?.options?.servername).toBe("prod.example.internal");
    expect(options.headers).toBeUndefined();
  });

  it("gives up on an unresponsive engine instead of hanging", async () => {
    const logFailure = vi.fn();
    const result = await testTcpTlsConnection(
      {
        kind: "tcpTls",
        label: "Prod TLS Docker",
        connection: { host: "10.0.0.4", port: 2376 },
        tls: { tlsMode: "serverOnly", serverName: null, caPath: "/tmp/ca.pem", certPath: null, keyPath: null },
      },
      {
        readFile: vi.fn(async () => Buffer.from("contents")),
        createDockerClient: vi.fn().mockReturnValue({ info: vi.fn(() => new Promise(() => {})) }),
        timeoutMs: 10,
        logFailure,
      },
    );

    expect(result.code).toBe("connection_timeout");
    expect(result.health.status).toBe("unhealthy");
    expect(logFailure).toHaveBeenCalledWith(expect.stringContaining("connection_timeout"));
  });

  it("returns the same message whatever the remote failure was", async () => {
    const probe = async (failure: unknown) =>
      (
        await testTcpTlsConnection(
          {
            kind: "tcpTls",
            label: "Prod TLS Docker",
            connection: { host: "10.0.0.4", port: 2376 },
            tls: { tlsMode: "serverOnly", serverName: null, caPath: "/tmp/ca.pem", certPath: null, keyPath: null },
          },
          {
            readFile: vi.fn(async () => Buffer.from("contents")),
            createDockerClient: vi.fn().mockReturnValue({ info: vi.fn().mockRejectedValue(failure) }),
            logFailure: vi.fn(),
          },
        )
      ).health.message;

    const messages = await Promise.all([
      probe(Object.assign(new Error("connect ECONNREFUSED 10.0.0.4:2376"), { code: "ECONNREFUSED" })),
      probe(Object.assign(new Error("getaddrinfo ENOTFOUND 10.0.0.4"), { code: "ENOTFOUND" })),
      probe(Object.assign(new Error("connect EHOSTUNREACH 10.0.0.4:2376"), { code: "EHOSTUNREACH" })),
      probe(new Error("unable to verify first certificate")),
      probe(new Error("socket hang up on an unexpected protocol")),
    ]);

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).not.toMatch(/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|certificate|10\.0\.0\.4/);
  });

  it("classifies daemon unreachable failures", async () => {
    const result = await testTcpTlsConnection(
      {
        kind: "tcpTls",
        label: "Prod TLS Docker",
        connection: {
          host: "prod.example.internal",
          port: 2376,
        },
        tls: {
          tlsMode: "serverOnly",
          serverName: "prod.example.internal",
          caPath: "/tmp/prod-ca.pem",
          certPath: null,
          keyPath: null,
        },
      },
      {
        readFile: vi.fn(async () => Buffer.from("contents")),
        createDockerClient: vi.fn().mockReturnValue({
          info: vi.fn().mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })),
        }),
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        code: "docker_unavailable",
        health: expect.objectContaining({
          status: "unhealthy",
        }),
      }),
    );
  });

  it("rejects insecure TCP profiles", async () => {
    const result = await testTcpTlsConnection({
      kind: "tcp",
      label: "Insecure Docker",
      connection: {
        host: "prod.example.internal",
        port: 2375,
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        code: "insecure_tcp_not_supported",
        health: expect.objectContaining({
          status: "unhealthy",
        }),
      }),
    );
  });
});

describe("backend-construction credential-path redaction", () => {
  it("redacts the ssh key path from an EACCES read during construction", async () => {
    let caught: unknown;
    try {
      await createSshDockerConnectionConfig(
        { kind: "ssh", connection: { host: "h", port: 22 }, ssh: { username: "u", authMode: "keyFile", keyPath: "/secure/id_ed25519" } },
        {
          readFile: vi.fn(async (path: string) => {
            if (path === "/secure/id_ed25519") {
              throw Object.assign(new Error("EACCES: permission denied, open '/secure/id_ed25519'"), { code: "EACCES" });
            }
            return Buffer.from(KNOWN_HOSTS);
          }),
        },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain("/secure/id_ed25519");
    expect((caught as Error).message).toContain("<path>");
  });

  it("redacts the tls cert path from an EACCES read during construction", async () => {
    let caught: unknown;
    try {
      await createTcpTlsDockerConnectionConfig(
        { kind: "tcpTls", connection: { host: "h", port: 2376 }, tls: { tlsMode: "serverOnly", caPath: "/secure/ca.pem", certPath: null, keyPath: null } },
        {
          readFile: vi.fn().mockRejectedValue(
            Object.assign(new Error("EACCES: permission denied, open '/secure/ca.pem'"), { code: "EACCES" }),
          ),
        },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain("/secure/ca.pem");
    expect((caught as Error).message).toContain("<path>");
  });
});

function sshTarget(ssh: { knownHostsPath: string | null }) {
  return {
    kind: "ssh",
    label: "Prod SSH Docker",
    connection: { host: "prod.example.internal", port: 22 },
    ssh: {
      username: "dockerops",
      authMode: "agent",
      keyPath: null,
      dockerHostOverride: null,
      ...ssh,
    },
  };
}

describe("testSshConnection", () => {
  it("reports a healthy SSH target using agent auth", async () => {
    const info = vi.fn().mockResolvedValue({ ID: "daemon" });
    const createDockerClient = vi.fn().mockReturnValue({ info });

    const result = await testSshConnection(
      {
        kind: "ssh",
        label: "Prod SSH Docker",
        connection: {
          host: "prod.example.internal",
          port: 22,
        },
        ssh: {
          username: "dockerops",
          authMode: "agent",
          keyPath: null,
          knownHostsPath: null,
          dockerHostOverride: null,
        },
      },
      {
        readFile: knownHostsReader(),
        createDockerClient,
        sshAgentPath: "/tmp/mock-agent.sock",
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        code: "connected",
        health: expect.objectContaining({
          status: "healthy",
        }),
      }),
    );
    expect(createDockerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: "ssh",
        host: "prod.example.internal",
        port: 22,
        username: "dockerops",
        sshOptions: expect.objectContaining({
          agent: "/tmp/mock-agent.sock",
        }),
      }),
    );
  });

  it("reports a healthy SSH target using a key file", async () => {
    const info = vi.fn().mockResolvedValue({ ID: "daemon" });
    const createDockerClient = vi.fn().mockReturnValue({ info });
    const readFile = vi.fn(async (path: string) =>
      path === "/tmp/id_ed25519" ? Buffer.from("private-key") : Buffer.from(KNOWN_HOSTS),
    );

    const result = await testSshConnection(
      {
        kind: "ssh",
        label: "Prod SSH Docker",
        connection: {
          host: "prod.example.internal",
          port: 22,
        },
        ssh: {
          username: "dockerops",
          authMode: "keyFile",
          keyPath: "/tmp/id_ed25519",
          knownHostsPath: null,
          dockerHostOverride: null,
        },
      },
      {
        readFile,
        createDockerClient,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        code: "connected",
        health: expect.objectContaining({
          status: "healthy",
        }),
      }),
    );
    expect(createDockerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        sshOptions: expect.objectContaining({
          privateKey: Buffer.from("private-key"),
        }),
      }),
    );
  });

  it("classifies SSH authentication failures", async () => {
    const result = await testSshConnection(
      {
        kind: "ssh",
        label: "Prod SSH Docker",
        connection: {
          host: "prod.example.internal",
          port: 22,
        },
        ssh: {
          username: "dockerops",
          authMode: "agent",
          keyPath: null,
          knownHostsPath: null,
          dockerHostOverride: null,
        },
      },
      {
        readFile: knownHostsReader(),
        createDockerClient: vi.fn().mockReturnValue({
          info: vi.fn().mockRejectedValue(new Error("All configured authentication methods failed")),
        }),
        sshAgentPath: "/tmp/mock-agent.sock",
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        code: "ssh_auth_failed",
        health: expect.objectContaining({
          status: "unhealthy",
        }),
      }),
    );
  });

  it("classifies SSH hostname resolution failures", async () => {
    const result = await testSshConnection(
      {
        kind: "ssh",
        label: "Prod SSH Docker",
        connection: {
          host: "prod.example.internal",
          port: 22,
        },
        ssh: {
          username: "dockerops",
          authMode: "agent",
          keyPath: null,
          knownHostsPath: null,
          dockerHostOverride: null,
        },
      },
      {
        readFile: knownHostsReader(),
        createDockerClient: vi.fn().mockReturnValue({
          info: vi.fn().mockRejectedValue(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })),
        }),
        sshAgentPath: "/tmp/mock-agent.sock",
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        code: "ssh_hostname_not_found",
        health: expect.objectContaining({
          status: "unhealthy",
        }),
      }),
    );
  });

  it("redacts the key path (even a relative one) from a failed key-file read", async () => {
    const keyPath = "../secrets/id_ed25519";
    const result = await testSshConnection(
      {
        kind: "ssh",
        label: "Prod SSH Docker",
        connection: {
          host: "prod.example.internal",
          port: 22,
        },
        ssh: {
          username: "dockerops",
          authMode: "keyFile",
          keyPath,
          knownHostsPath: null,
          dockerHostOverride: null,
        },
      },
      {
        readFile: vi.fn(async (path: string) => {
          if (path === keyPath) {
            throw Object.assign(new Error(`ENOENT: no such file or directory, open '${keyPath}'`), { code: "ENOENT" });
          }
          return Buffer.from(KNOWN_HOSTS);
        }),
      },
    );

    expect(result.health.status).toBe("unhealthy");
    expect(result.health.message).not.toContain(keyPath);
    expect(result.health.message).toContain("<path>");
  });

  it("rejects unsupported SSH configuration combinations", async () => {
    const result = await testSshConnection(
      {
        kind: "ssh",
        label: "Prod SSH Docker",
        connection: {
          host: "prod.example.internal",
          port: 22,
        },
        ssh: {
          username: "dockerops",
          authMode: "keyFile",
          keyPath: null,
          knownHostsPath: null,
          dockerHostOverride: null,
        },
      },
      { readFile: knownHostsReader() },
    );

    expect(result).toEqual(
      expect.objectContaining({
        code: "unsupported_ssh_configuration",
        health: expect.objectContaining({
          status: "unhealthy",
        }),
      }),
    );
  });

  it("accepts a host key that matches known_hosts", async () => {
    const readFile = knownHostsReader();
    const createDockerClient = vi.fn((options?: { sshOptions?: { hostVerifier?: unknown } }) => ({
      info: async () => {
        expect(asSyncHostVerifier(options?.sshOptions?.hostVerifier)(HOST_KEY)).toBe(true);
        return { ID: "daemon" };
      },
    }));

    const result = await testSshConnection(sshTarget({ knownHostsPath: "/tmp/known_hosts" }), {
      readFile,
      createDockerClient,
      sshAgentPath: "/tmp/mock-agent.sock",
    });

    expect(result.code).toBe("connected");
    expect(readFile).toHaveBeenCalledWith("/tmp/known_hosts");
  });

  it("rejects a host key that does not match known_hosts", async () => {
    const createDockerClient = vi.fn((options?: { sshOptions?: { hostVerifier?: unknown } }) => ({
      info: async () => {
        expect(asSyncHostVerifier(options?.sshOptions?.hostVerifier)(OTHER_KEY)).toBe(false);
        throw new Error("Handshake failed: no matching host key format");
      },
    }));

    const result = await testSshConnection(sshTarget({ knownHostsPath: "/tmp/known_hosts" }), {
      readFile: knownHostsReader(),
      createDockerClient,
      sshAgentPath: "/tmp/mock-agent.sock",
    });

    expect(result.code).toBe("ssh_host_key_rejected");
    expect(result.health.message).toContain("does not match its known_hosts entry");
    expect(result.health.message).toContain("man-in-the-middle");
  });

  it("rejects a host that is absent from known_hosts", async () => {
    const createDockerClient = vi.fn((options?: { sshOptions?: { hostVerifier?: unknown } }) => ({
      info: async () => {
        expect(asSyncHostVerifier(options?.sshOptions?.hostVerifier)(HOST_KEY)).toBe(false);
        throw new Error("Handshake failed");
      },
    }));

    const result = await testSshConnection(sshTarget({ knownHostsPath: "/tmp/known_hosts" }), {
      readFile: knownHostsReader("other.example.internal ssh-ed25519 AAAA\n"),
      createDockerClient,
      sshAgentPath: "/tmp/mock-agent.sock",
    });

    expect(result.code).toBe("ssh_host_key_rejected");
    expect(result.health.message).toContain("not listed in known_hosts");
  });

  it("falls back to the default known_hosts file when the target sets none", async () => {
    const readFile = knownHostsReader();

    await testSshConnection(sshTarget({ knownHostsPath: null }), {
      readFile,
      createDockerClient: vi.fn().mockReturnValue({ info: vi.fn().mockResolvedValue({ ID: "daemon" }) }),
      sshAgentPath: "/tmp/mock-agent.sock",
    });

    expect(readFile).toHaveBeenCalledWith(expect.stringContaining("known_hosts"));
  });

  it("refuses to connect when no known_hosts file can be read", async () => {
    const result = await testSshConnection(sshTarget({ knownHostsPath: "/secure/known_hosts" }), {
      readFile: vi.fn().mockRejectedValue(
        Object.assign(new Error("ENOENT: no such file or directory, open '/secure/known_hosts'"), { code: "ENOENT" }),
      ),
      createDockerClient: vi.fn().mockReturnValue({ info: vi.fn().mockResolvedValue({ ID: "daemon" }) }),
      sshAgentPath: "/tmp/mock-agent.sock",
    });

    expect(result.code).toBe("unsupported_ssh_configuration");
    expect(result.health.message).toContain("readable known_hosts file");
    expect(result.health.message).not.toContain("/secure/known_hosts");
  });

  it("gives up on an unresponsive SSH host instead of hanging", async () => {
    vi.useFakeTimers();
    try {
      // docker.info() never settles, so only the injected deadline can unblock
      // the call: prove the call is bounded BY that deadline, not by luck.
      const info = vi.fn(() => new Promise<never>(() => {}));
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const timeoutMs = 10;

      let settled = false;
      const resultPromise = testSshConnection(sshTarget({ knownHostsPath: "/tmp/known_hosts" }), {
        readFile: knownHostsReader(),
        createDockerClient: vi.fn().mockReturnValue({ info }),
        sshAgentPath: "/tmp/mock-agent.sock",
        timeoutMs,
        logFailure: vi.fn(),
      }).then((result) => {
        settled = true;
        return result;
      });

      // One tick short of the deadline: the probe must still be pending.
      await vi.advanceTimersByTimeAsync(timeoutMs - 1);
      expect(settled).toBe(false);

      // Crossing the deadline is what unblocks it.
      await vi.advanceTimersByTimeAsync(1);
      const result = await resultPromise;

      expect(settled).toBe(true);
      expect(result.code).toBe("connection_timeout");
      // The race's own timer handle is cleared once the deadline fires — the
      // one piece of cleanup `withDeadline` actually performs.
      expect(clearTimeoutSpy).toHaveBeenCalled();
      // NOTE: this only proves the race timer is cleared. Neither `withDeadline`
      // nor `testSshConnection` cancels or destroys the underlying `docker`
      // client / `docker.info()` call itself — the abandoned promise (and, on
      // a real SSH/TCP target, its socket) is left running with no teardown.
      // That is a genuine gap, not something this test can honestly assert away.
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("verifyHostKey", () => {
  it("matches a plain entry and rejects a different key", () => {
    expect(verifyHostKey(KNOWN_HOSTS, "prod.example.internal", 22, HOST_KEY)).toBe("match");
    expect(verifyHostKey(KNOWN_HOSTS, "prod.example.internal", 22, OTHER_KEY)).toBe("mismatch");
    expect(verifyHostKey(KNOWN_HOSTS, "staging.example.internal", 22, HOST_KEY)).toBe("unknown");
  });

  it("matches the bracketed form for a non-default port", () => {
    const knownHosts = `[prod.example.internal]:2222 ssh-ed25519 ${HOST_KEY.toString("base64")}\n`;

    expect(verifyHostKey(knownHosts, "prod.example.internal", 2222, HOST_KEY)).toBe("match");
    expect(verifyHostKey(knownHosts, "prod.example.internal", 22, HOST_KEY)).toBe("unknown");
  });

  it("matches a hashed entry", () => {
    const salt = Buffer.from("0123456789abcdef0123");
    const hash = createHmac("sha1", salt).update("prod.example.internal").digest("base64");
    const knownHosts = `|1|${salt.toString("base64")}|${hash} ssh-ed25519 ${HOST_KEY.toString("base64")}\n`;

    expect(verifyHostKey(knownHosts, "prod.example.internal", 22, HOST_KEY)).toBe("match");
    expect(verifyHostKey(knownHosts, "prod.example.internal", 22, OTHER_KEY)).toBe("mismatch");
  });

  it("honours wildcard patterns and @revoked markers", () => {
    const wildcard = `*.example.internal ssh-ed25519 ${HOST_KEY.toString("base64")}\n`;
    expect(verifyHostKey(wildcard, "prod.example.internal", 22, HOST_KEY)).toBe("match");

    const revoked = `${wildcard}@revoked prod.example.internal ssh-ed25519 ${HOST_KEY.toString("base64")}\n`;
    expect(verifyHostKey(revoked, "prod.example.internal", 22, HOST_KEY)).toBe("revoked");
  });
});
