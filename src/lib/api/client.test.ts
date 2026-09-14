import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  attachStreamTicket,
  getApiBaseUrl,
  resetAuthRuntimeState,
  resolveStreamEndpoint,
  setApiBaseUrl,
  setAuthRuntimeState,
} from "@/lib/api/client";

const fetchMock = vi.fn();

describe("api client auth behavior", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
    resetAuthRuntimeState();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    resetAuthRuntimeState();
  });

  it("uses the stored backend base url", () => {
    setApiBaseUrl("http://127.0.0.1:9001");

    expect(getApiBaseUrl()).toBe("http://127.0.0.1:9001");
  });

  it("adds the bearer token to authenticated requests", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ authenticated: false })));
    setAuthRuntimeState({
      token: "jwt-token",
    });

    await apiRequest("/api/auth/session", { auth: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9001/api/auth/session",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-token",
        }),
      }),
    );
  });

  it("opens a stream with a single-use ticket instead of the bearer token", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ticket: "one-shot-ticket", expiresAt: "2026-01-01T00:00:00.000Z" })),
    );
    setAuthRuntimeState({ token: "stream-token" });

    const url = await attachStreamTicket(resolveStreamEndpoint("/api/containers/demo/logs/stream"));

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9001/api/auth/stream-ticket",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer stream-token" }),
      }),
    );
    expect(url.toString()).toBe(
      "http://127.0.0.1:9001/api/containers/demo/logs/stream?ticket=one-shot-ticket",
    );
    expect(url.toString()).not.toContain("stream-token");
    expect(url.searchParams.has("access_token")).toBe(false);
  });

  it("skips the ticket round-trip when there is no token (auth-bypass mode)", async () => {
    const url = await attachStreamTicket(resolveStreamEndpoint("/api/containers/demo/logs/stream"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(url.search).toBe("");
  });

  it("tickets a websocket endpoint too, preserving its other query params", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ticket: "ws-ticket", expiresAt: "2026-01-01T00:00:00.000Z" })),
    );
    setAuthRuntimeState({ token: "ws-token" });

    const endpoint = resolveStreamEndpoint("/api/containers/demo/exec", "websocket");
    endpoint.searchParams.set("cols", "80");

    const url = await attachStreamTicket(endpoint);

    expect(url.protocol).toBe("ws:");
    expect(url.searchParams.get("cols")).toBe("80");
    expect(url.searchParams.get("ticket")).toBe("ws-ticket");
    expect(url.toString()).not.toContain("ws-token");
  });

  it("merges caller-supplied headers with the auth/default headers instead of replacing them", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    setAuthRuntimeState({ token: "jwt-token" });

    await apiRequest("/api/engine", {
      auth: true,
      headers: { "X-Custom": "value" },
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Custom": "value",
      Authorization: "Bearer jwt-token",
    });
  });

  it("keeps default headers unchanged when a caller passes none", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await apiRequest("/api/engine");

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  });

  it("does not forward baseUrl or auth as stray fetch options", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await apiRequest("/api/engine", { baseUrl: "http://example.test", auth: true });

    const [requestedUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestedUrl).toBe("http://example.test/api/engine");
    expect(requestInit).not.toHaveProperty("baseUrl");
    expect(requestInit).not.toHaveProperty("auth");
  });

  it("never puts the auth token in an ordinary fetch url", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    setAuthRuntimeState({ token: "jwt-token" });

    await apiRequest("/api/engine", { auth: true });

    const [requestedUrl] = fetchMock.mock.calls[0];
    expect(String(requestedUrl)).not.toContain("access_token");
    expect(String(requestedUrl)).toBe("http://127.0.0.1:9001/api/engine");
  });

  it("builds a websocket stream endpoint carrying no credential at all", () => {
    setAuthRuntimeState({ token: "ws-token" });

    const url = resolveStreamEndpoint("/api/containers/demo/exec", "websocket");

    expect(url.protocol).toBe("ws:");
    expect(url.host).toBe("127.0.0.1:9001");
    expect(url.pathname).toBe("/api/containers/demo/exec");
    expect(url.search).toBe("");
    expect(url.toString()).not.toContain("ws-token");
  });

  it("uses wss when the backend base url is https", () => {
    setApiBaseUrl("https://remote.example:9443");
    setAuthRuntimeState({ token: "ws-token" });

    const url = resolveStreamEndpoint("/api/containers/demo/exec", "websocket");

    expect(url.protocol).toBe("wss:");
    expect(url.host).toBe("remote.example:9443");
  });

  it("never puts the bearer token in a stream url", () => {
    setAuthRuntimeState({ token: "stream-token" });

    const sse = resolveStreamEndpoint("/api/containers/demo/logs/stream", "sse");

    expect(sse.searchParams.has("access_token")).toBe(false);
    expect(sse.toString()).not.toContain("stream-token");
  });

  it("preserves a configured base-url path prefix in a websocket endpoint", () => {
    setApiBaseUrl("https://host.example/proxy");

    const ws = resolveStreamEndpoint("/api/containers/demo/exec", "websocket");

    expect(ws.protocol).toBe("wss:");
    expect(ws.host).toBe("host.example");
    expect(ws.pathname).toBe("/proxy/api/containers/demo/exec");
  });

  it("resolves a relative/same-origin base against the page origin", () => {
    // e.g. VITE_API_BASE_URL="" or a "/docklite" prefix — must not throw.
    setApiBaseUrl("/docklite");

    const sse = resolveStreamEndpoint("/api/containers/demo/logs/stream", "sse");
    expect(sse.origin).toBe(window.location.origin);
    expect(sse.pathname).toBe("/docklite/api/containers/demo/logs/stream");

    const ws = resolveStreamEndpoint("/api/containers/demo/exec", "websocket");
    expect(ws.host).toBe(window.location.host);
    expect(["ws:", "wss:"]).toContain(ws.protocol);
  });
});
