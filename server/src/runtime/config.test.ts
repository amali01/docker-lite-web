import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeConfig } from "./config";

describe("runtime config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to a local-only http runtime", () => {
    const config = getRuntimeConfig();

    expect(config.remoteModeEnabled).toBe(false);
    expect(config.host).toBe("127.0.0.1");
    expect(config.sameOriginMode).toBe(false);
    expect(config.staticDir).toBeNull();
  });

  it("enables same-origin remote mode when requested", () => {
    vi.stubEnv("DOCKLITE_REMOTE_ENABLED", "true");

    const config = getRuntimeConfig();

    expect(config.remoteModeEnabled).toBe(true);
    expect(config.sameOriginMode).toBe(true);
    expect(config.host).toBe("0.0.0.0");
    expect(config.staticDir).toContain("/dist");
  });
});
