import { describe, expect, it, vi } from "vitest";
import { testTcpTlsConnection } from "./connection-test";

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
