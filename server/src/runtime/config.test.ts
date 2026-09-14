import { afterEach, describe, expect, it, vi } from "vitest";
import { assertBindIsServable, getRuntimeConfig, isLoopbackHost } from "./config";

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

describe("assertBindIsServable", () => {
  // The whole point of H9: admin/admin + a bind reachable off-box + a mounted
  // Docker socket is remote root on the host. Refuse the bind, loudly.
  it("refuses a non-loopback bind while the built-in password is active", () => {
    expect(() => assertBindIsServable("0.0.0.0", true)).toThrow(/DOCKLITE_ADMIN_PASSWORD/);
  });

  it("names the host it refused and the loopback escape hatch", () => {
    expect(() => assertBindIsServable("192.168.1.10", true)).toThrow(/192\.168\.1\.10/);
    expect(() => assertBindIsServable("192.168.1.10", true)).toThrow(/DOCKLITE_HOST/);
  });

  it("allows a non-loopback bind once the operator has set a real password", () => {
    expect(() => assertBindIsServable("0.0.0.0", false)).not.toThrow();
  });

  it.each([
    ["127.0.0.1", true],
    ["127.0.0.1", false],
    ["::1", true],
    ["::1", false],
  ])("allows loopback bind %j with defaultCredentialsActive=%s", (host, defaultCredentialsActive) => {
    expect(() => assertBindIsServable(host, defaultCredentialsActive)).not.toThrow();
  });
});
