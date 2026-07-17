import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeConfig, isLoopbackHost } from "./config";

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
    expect(config.allowAuthBypass).toBe(true);
  });

  // The auth-bypass (disable-login) gate hangs off this classification, so pin
  // it down: only canonical loopback literals may ever allow a bypass.
  it.each([
    ["127.0.0.1", true],
    ["::1", true],
    ["0.0.0.0", false],
    ["::", false],
    ["192.168.1.10", false],
    ["localhost", false],
    ["", false],
  ])("isLoopbackHost(%j) === %s", (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });

  it("does not allow auth bypass when bound to a non-loopback host", () => {
    vi.stubEnv("DOCKLITE_HOST", "0.0.0.0");

    const config = getRuntimeConfig();

    expect(config.host).toBe("0.0.0.0");
    expect(config.allowAuthBypass).toBe(false);
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
