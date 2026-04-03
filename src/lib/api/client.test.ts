import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  createStreamUrl,
  getApiBaseUrl,
  resetAuthRuntimeState,
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
});
