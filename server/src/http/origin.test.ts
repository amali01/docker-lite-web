import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { isLoopbackOrigin, isTrustedOrigin } from "./origin";

describe("isLoopbackOrigin", () => {
  it("accepts an absent origin and the loopback literals", () => {
    expect(isLoopbackOrigin(undefined)).toBe(true);
    expect(isLoopbackOrigin("http://localhost:8080")).toBe(true);
    expect(isLoopbackOrigin("http://127.0.0.1:9001")).toBe(true);
    expect(isLoopbackOrigin("https://[::1]")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isLoopbackOrigin("http://192.168.1.50:9001")).toBe(false);
    expect(isLoopbackOrigin("https://evil.example.com")).toBe(false);
    expect(isLoopbackOrigin("http://localhost.evil.example.com")).toBe(false);
  });
});

describe("isTrustedOrigin", () => {
  it("accepts an absent origin (non-browser client, not a CSRF vector)", () => {
    expect(isTrustedOrigin(undefined, "127.0.0.1:9001")).toBe(true);
  });

  it("accepts an origin matching the request's own host", () => {
    // The remote/sameOriginMode regression guard: the app is served from a LAN
    // IP there, so a loopback-only allowlist would reject every real request.
    expect(isTrustedOrigin("http://192.168.1.50:9001", "192.168.1.50:9001")).toBe(true);
    expect(isTrustedOrigin("https://docklite.lan", "docklite.lan")).toBe(true);
    expect(isTrustedOrigin("http://192.168.1.50:9001", "192.168.1.50:9002")).toBe(false);
  });

  it("accepts the split-port loopback dev origin", () => {
    expect(isTrustedOrigin("http://localhost:8080", "localhost:9001")).toBe(true);
  });

  it("rejects a foreign origin and an opaque one", () => {
    expect(isTrustedOrigin("https://evil.example.com", "127.0.0.1:9001")).toBe(false);
    expect(isTrustedOrigin("null", "127.0.0.1:9001")).toBe(false);
  });
});

describe("websocket upgrade origin guard", () => {
  const closers: Array<() => void> = [];

  afterEach(() => {
    closers.splice(0).forEach((close) => close());
  });

  // Mirrors the guard in server/src/index.ts, which cannot be imported here
  // because that module starts the real server on import.
  async function startExecServer() {
    const server = createServer();
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
      if (!isTrustedOrigin(request.headers.origin, request.headers.host)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => ws.close());
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closers.push(() => {
      wss.close();
      server.close();
    });

    return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/containers/abc/exec`;
  }

  function connect(url: string, origin?: string) {
    return new Promise<"open" | string>((resolve) => {
      const ws = new WebSocket(url, { origin });
      ws.on("open", () => {
        ws.close();
        resolve("open");
      });
      ws.on("error", (error: Error) => resolve(error.message));
    });
  }

  it("rejects an upgrade from a foreign origin with 403", async () => {
    const url = await startExecServer();

    expect(await connect(url, "https://evil.example.com")).toContain("403");
  });

  it("accepts an upgrade with no origin or a loopback origin", async () => {
    const url = await startExecServer();

    expect(await connect(url)).toBe("open");
    expect(await connect(url, "http://localhost:8080")).toBe("open");
  });
});
