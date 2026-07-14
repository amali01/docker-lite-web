import { describe, expect, it } from "vitest";
import { buildProfile, getEndpoint, isAvailable, toPublicTarget, type ProfileMeta } from "./profile";

const meta: ProfileMeta = {
  id: "t1",
  source: "saved",
  enabled: true,
  lastHealth: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("buildProfile", () => {
  it("builds a local profile", () => {
    const profile = buildProfile({ label: "L", kind: "local", connection: { socketPath: "/var/run/docker.sock" } }, meta);
    expect(profile).toMatchObject({ id: "t1", kind: "local", source: "saved", connection: { socketPath: "/var/run/docker.sock" } });
  });

  it("builds an ssh profile with null defaults for optional fields", () => {
    const profile = buildProfile(
      { label: "S", kind: "ssh", connection: { host: "h", port: 22 }, ssh: { username: "u", authMode: "agent" } },
      meta,
    );
    expect(profile).toMatchObject({
      kind: "ssh",
      ssh: { username: "u", authMode: "agent", keyPath: null, knownHostsPath: null, dockerHostOverride: null },
    });
  });

  it("builds a tcpTls profile with null cert defaults", () => {
    const profile = buildProfile(
      { label: "T", kind: "tcpTls", connection: { host: "h", port: 2376 }, tls: { tlsMode: "serverOnly" } },
      meta,
    );
    expect(profile).toMatchObject({
      kind: "tcpTls",
      tls: { tlsMode: "serverOnly", serverName: null, caPath: null, certPath: null, keyPath: null },
    });
  });
});

describe("getEndpoint / isAvailable", () => {
  it("formats an endpoint per kind", () => {
    expect(getEndpoint(buildProfile({ label: "L", kind: "local", connection: { socketPath: "/s" } }, meta))).toBe("unix:///s");
    expect(
      getEndpoint(buildProfile({ label: "S", kind: "ssh", connection: { host: "h", port: 22 }, ssh: { username: "u", authMode: "agent" } }, meta)),
    ).toBe("ssh://u@h");
    expect(
      getEndpoint(buildProfile({ label: "T", kind: "tcpTls", connection: { host: "h", port: 2376 }, tls: { tlsMode: "serverOnly" } }, meta)),
    ).toBe("tcp://h:2376");
  });

  it("treats a disabled target as unavailable", () => {
    const profile = buildProfile({ label: "L", kind: "local", connection: { socketPath: "/s" } }, { ...meta, enabled: false });
    expect(isAvailable(profile)).toBe(false);
  });
});

describe("toPublicTarget redaction (allowlist projection)", () => {
  it("never exposes ssh credentials or connection material", () => {
    const profile = buildProfile(
      { label: "S", kind: "ssh", connection: { host: "secret-host", port: 22 }, ssh: { username: "root", authMode: "keyFile", keyPath: "/secret/id_ed25519" } },
      meta,
    );
    const pub = toPublicTarget(profile, "t1");
    expect(pub).not.toHaveProperty("ssh");
    expect(pub).not.toHaveProperty("connection");
    expect(JSON.stringify(pub)).not.toContain("/secret/id_ed25519");
    expect(pub.active).toBe(true);
  });

  it("never exposes tls cert/key paths", () => {
    const profile = buildProfile(
      { label: "T", kind: "tcpTls", connection: { host: "h", port: 2376 }, tls: { tlsMode: "mtls", caPath: "/ca.pem", certPath: "/client-cert.pem", keyPath: "/client-key.pem" } },
      meta,
    );
    const pub = toPublicTarget(profile, null);
    expect(pub).not.toHaveProperty("tls");
    expect(pub).not.toHaveProperty("connection");
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain("/client-cert.pem");
    expect(serialized).not.toContain("/client-key.pem");
  });

  it("exposes only the allowlisted public fields", () => {
    const profile = buildProfile({ label: "L", kind: "local", connection: { socketPath: "/var/run/docker.sock" } }, meta);
    const pub = toPublicTarget(profile, "t1");
    expect(Object.keys(pub).sort()).toEqual([
      "active",
      "available",
      "endpoint",
      "id",
      "kind",
      "label",
      "lastHealth",
      "source",
    ]);
  });
});
