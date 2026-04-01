import { describe, expect, it } from "vitest";
import { classifyRequest, isLoopbackAddress } from "./request-classifier";

describe("request classification", () => {
  it("detects loopback addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("203.0.113.10")).toBe(false);
  });

  it("does not trust forwarded headers when deciding local bypass", () => {
    const result = classifyRequest({
      channel: "http",
      protocol: "http",
      remoteAddress: "203.0.113.10",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "x-forwarded-for": "127.0.0.1",
        forwarded: "for=127.0.0.1;proto=http;host=127.0.0.1:3000",
      },
    });

    expect(result.access).toBe("remote");
    expect(result.isLoopback).toBe(false);
    expect(result.reason).toMatch(/socket/i);
  });

  it("allows loopback http requests with a matching browser origin", () => {
    const result = classifyRequest({
      channel: "http",
      protocol: "http",
      remoteAddress: "127.0.0.1",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        access: "local",
        isLoopback: true,
        browserOrigin: "trusted",
      }),
    );
  });

  it("refuses loopback bypass for cross-origin browser requests", () => {
    const result = classifyRequest({
      channel: "http",
      protocol: "http",
      remoteAddress: "127.0.0.1",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://localhost:3000",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        access: "remote",
        isLoopback: true,
        browserOrigin: "untrusted",
      }),
    );
  });

  it("applies the same origin checks to sse and websocket requests", () => {
    const sseResult = classifyRequest({
      channel: "sse",
      protocol: "https",
      remoteAddress: "::1",
      headers: {
        host: "[::1]:3443",
        origin: "https://[::1]:3443",
      },
    });
    const wsResult = classifyRequest({
      channel: "ws",
      protocol: "https",
      remoteAddress: "::1",
      headers: {
        host: "[::1]:3443",
        origin: "https://[::1]:3443",
      },
    });

    expect(sseResult.access).toBe("local");
    expect(wsResult.access).toBe("local");
    expect(sseResult.browserOrigin).toBe("trusted");
    expect(wsResult.browserOrigin).toBe("trusted");
  });
});
