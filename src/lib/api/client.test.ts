import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  createStreamUrl,
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

  it("adds the bearer token to stream urls", () => {
    setAuthRuntimeState({
      token: "stream-token",
    });

    expect(createStreamUrl("/api/containers/demo/logs/stream")).toBe(
      "http://127.0.0.1:9001/api/containers/demo/logs/stream?access_token=stream-token",
    );
  });

  it("never puts the auth token in an ordinary fetch url", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    setAuthRuntimeState({ token: "jwt-token" });

    await apiRequest("/api/engine", { auth: true });

    const [requestedUrl] = fetchMock.mock.calls[0];
    expect(String(requestedUrl)).not.toContain("access_token");
    expect(String(requestedUrl)).toBe("http://127.0.0.1:9001/api/engine");
  });

  it("builds a websocket stream endpoint with the token in the query", () => {
    setAuthRuntimeState({ token: "ws-token" });

    const url = resolveStreamEndpoint("/api/containers/demo/exec", "websocket");

    expect(url.protocol).toBe("ws:");
    expect(url.host).toBe("127.0.0.1:9001");
    expect(url.pathname).toBe("/api/containers/demo/exec");
    expect(url.searchParams.get("access_token")).toBe("ws-token");
  });

  it("uses wss when the backend base url is https", () => {
    setApiBaseUrl("https://remote.example:9443");
    setAuthRuntimeState({ token: "ws-token" });

    const url = resolveStreamEndpoint("/api/containers/demo/exec", "websocket");

    expect(url.protocol).toBe("wss:");
    expect(url.host).toBe("remote.example:9443");
  });

  it("omits the token from stream urls when unauthenticated", () => {
    const sse = resolveStreamEndpoint("/api/containers/demo/logs/stream", "sse");
    expect(sse.searchParams.has("access_token")).toBe(false);
  });

  it("preserves a configured base-url path prefix in a websocket endpoint", () => {
    setApiBaseUrl("https://host.example/proxy");

    const ws = resolveStreamEndpoint("/api/containers/demo/exec", "websocket");

    expect(ws.protocol).toBe("wss:");
    expect(ws.host).toBe("host.example");
    expect(ws.pathname).toBe("/proxy/api/containers/demo/exec");
  });
});
