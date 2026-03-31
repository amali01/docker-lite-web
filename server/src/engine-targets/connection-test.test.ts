import { describe, expect, it, vi } from "vitest";
import { testSshConnection, testTcpTlsConnection } from "./connection-test";

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
    const readFile = vi.fn(async () => Buffer.from("private-key"));

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

  it("rejects unsupported SSH configuration combinations", async () => {
    const result = await testSshConnection({
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
    });

    expect(result).toEqual(
      expect.objectContaining({
        code: "unsupported_ssh_configuration",
        health: expect.objectContaining({
          status: "unhealthy",
        }),
      }),
    );
  });
});
