import type {
  EngineTarget,
  EngineTargetHealth,
  EngineTargetKind,
  EngineTargetProfile,
  EngineTargetProfileInput,
  EngineTargetSource,
} from "./types";

/**
 * Single home for the EngineTargetProfile shape: per-kind construction, the
 * endpoint string, availability, and the public (redacted) projection. Before
 * this module the three-kind (local | ssh | tcpTls) branching was re-enumerated
 * across the store's two normalize functions and its endpoint/availability
 * helpers; adding a field to one kind meant editing several near-identical
 * blocks. Callers now build and project profiles through this one seam.
 */

export interface ProfileMeta {
  id: string;
  source: EngineTargetSource;
  enabled: boolean;
  lastHealth: EngineTargetHealth | null;
  createdAt: string;
  updatedAt: string;
}

/** Construct a typed profile from validated kind-specific input plus resolved metadata. */
export function buildProfile(input: EngineTargetProfileInput, meta: ProfileMeta): EngineTargetProfile {
  const base = {
    id: meta.id,
    label: input.label,
    source: meta.source,
    enabled: meta.enabled,
    lastHealth: meta.lastHealth,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };

  if (input.kind === "local") {
    return {
      ...base,
      kind: "local",
      connection: {
        socketPath: input.connection.socketPath,
      },
    };
  }

  if (input.kind === "ssh") {
    return {
      ...base,
      kind: "ssh",
      connection: {
        host: input.connection.host,
        port: input.connection.port,
      },
      ssh: {
        username: input.ssh.username,
        authMode: input.ssh.authMode,
        keyPath: input.ssh.keyPath ?? null,
        knownHostsPath: input.ssh.knownHostsPath ?? null,
        dockerHostOverride: input.ssh.dockerHostOverride ?? null,
      },
    };
  }

  return {
    ...base,
    kind: "tcpTls",
    connection: {
      host: input.connection.host,
      port: input.connection.port,
    },
    tls: {
      serverName: input.tls.serverName ?? null,
      tlsMode: input.tls.tlsMode,
      caPath: input.tls.caPath ?? null,
      certPath: input.tls.certPath ?? null,
      keyPath: input.tls.keyPath ?? null,
    },
  };
}

export function getEndpoint(profile: EngineTargetProfile): string {
  if (profile.kind === "local") {
    return `unix://${profile.connection.socketPath}`;
  }

  if (profile.kind === "ssh") {
    return `ssh://${profile.ssh.username}@${profile.connection.host}`;
  }

  return `tcp://${profile.connection.host}:${profile.connection.port}`;
}

export function isAvailable(profile: EngineTargetProfile): boolean {
  if (!profile.enabled) {
    return false;
  }

  if (profile.kind === "local") {
    return profile.lastHealth?.status !== "unhealthy";
  }

  return profile.lastHealth?.status === "healthy";
}

/**
 * The public projection is a strict allowlist: it names every field that may
 * cross the API seam and rebuilds each one explicitly, so credential material
 * — the raw `connection` object, ssh auth details, and the tls/ssh cert/key
 * file paths — is never carried along. `endpoint` is a deliberate human-
 * readable summary the Settings UI displays (`unix://<socket>`,
 * `ssh://user@host`, `tcp://host:port`); it intentionally names the socket
 * path / host / username but never any secret path or key. Keep this as an
 * allowlist rebuild — do not switch to a clone-then-delete strategy.
 */
export function toPublicTarget(profile: EngineTargetProfile, activeTargetId: string | null): EngineTarget {
  return {
    id: profile.id,
    label: profile.label,
    endpoint: getEndpoint(profile),
    active: profile.id === activeTargetId,
    available: isAvailable(profile),
    kind: profile.kind as EngineTargetKind,
    source: profile.source as EngineTargetSource,
    lastHealth: profile.lastHealth
      ? {
          status: profile.lastHealth.status,
          ...(profile.lastHealth.message !== undefined ? { message: profile.lastHealth.message } : {}),
          ...(profile.lastHealth.checkedAt !== undefined ? { checkedAt: profile.lastHealth.checkedAt } : {}),
        }
      : null,
  };
}
