import { describe, expect, it } from "vitest";
import { engineHostFromEndpoint, publishedPortHref } from "@/lib/port-links";

describe("engineHostFromEndpoint", () => {
  it("treats a unix socket engine as this machine", () => {
    expect(engineHostFromEndpoint("unix:///var/run/docker.sock")).toBe("localhost");
  });

  it("reads the host out of an ssh endpoint", () => {
    expect(engineHostFromEndpoint("ssh://deploy@build-01.internal")).toBe("build-01.internal");
  });

  it("reads the host out of a tcp endpoint", () => {
    expect(engineHostFromEndpoint("tcp://10.0.0.5:2376")).toBe("10.0.0.5");
  });

  it("returns null for a missing or unparseable endpoint", () => {
    expect(engineHostFromEndpoint(undefined)).toBeNull();
    expect(engineHostFromEndpoint("")).toBeNull();
    expect(engineHostFromEndpoint("not an endpoint")).toBeNull();
  });
});

describe("publishedPortHref", () => {
  it("returns null for a port that is not published", () => {
    expect(publishedPortHref("80/tcp", "localhost")).toBeNull();
  });

  it("uses the engine host for a wildcard binding", () => {
    expect(publishedPortHref("0.0.0.0:8080->80/tcp", "10.0.0.5")).toBe("http://10.0.0.5:8080");
    expect(publishedPortHref("[::]:8080->80/tcp", "10.0.0.5")).toBe("http://10.0.0.5:8080");
    expect(publishedPortHref(":::8080->80/tcp", "10.0.0.5")).toBe("http://10.0.0.5:8080");
  });

  it("honours an explicit bind address over the engine host", () => {
    expect(publishedPortHref("192.168.1.9:8080->80/tcp", "10.0.0.5")).toBe("http://192.168.1.9:8080");
  });

  it("does not link a loopback binding on a remote engine", () => {
    expect(publishedPortHref("127.0.0.1:8080->80/tcp", "10.0.0.5")).toBeNull();
    expect(publishedPortHref("127.0.0.1:8080->80/tcp", "localhost")).toBe("http://127.0.0.1:8080");
  });

  it("does not link at all when no engine host can be derived", () => {
    expect(publishedPortHref("0.0.0.0:8080->80/tcp", null)).toBeNull();
  });
});
