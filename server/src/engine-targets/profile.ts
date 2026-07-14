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

/**
 * Redact credential paths from a health/diagnostic message. Raw errors from a
 * failed key-file or certificate read include the credential path; those
 * messages get persisted onto a target profile and returned by
 * GET /api/engine/targets, so the path must be stripped before it is stored or
 * projected.
 *
 * Redaction is primarily VALUE-BASED: the exact configured path strings are
 * removed literally, which is format-agnostic (absolute, relative, spaces,
 * percent-encoding all match). A generic absolute-path regex runs afterward as
 * a fallback for stray OS paths not in the known set. Never classify on the
 * sanitized value — classification must run on the raw error message.
 */
export function sanitizeHealthMessage(message: string, secretPaths: Array<string | null | undefined> = []): string {
  let result = message;

  // Redact longest paths first so a nested path is not partially masked by a
  // shorter prefix (e.g. redacting "/a/b" before "/a/b/key.pem" would leave the
  // "/key.pem" suffix exposed).
  const orderedPaths = secretPaths
    .filter((secretPath): secretPath is string => Boolean(secretPath && secretPath.trim()))
    .sort((a, b) => b.length - a.length);

  for (const secretPath of orderedPaths) {
    result = result.split(secretPath).join("<path>");
  }

  return result
    // Windows drive paths: C:\Users\...\client-key.pem
    .replace(/[A-Za-z]:\\[^\s'"]+/g, "<path>")
    // Unix absolute / home paths, only after a boundary so substrings like
    // "Hostname/IP" are left intact.
    .replace(/(^|[\s'"(:=])(~?\/[A-Za-z0-9._/-]+)/g, "$1<path>");
}

/** Credential path fields of a profile that must never surface in a health message. */
export function profileSecretPaths(profile: EngineTargetProfile): string[] {
  if (profile.kind === "ssh") {
    return [profile.ssh.keyPath, profile.ssh.knownHostsPath].filter((path): path is string => Boolean(path));
  }

  if (profile.kind === "tcpTls") {
    return [profile.tls.caPath, profile.tls.certPath, profile.tls.keyPath].filter((path): path is string => Boolean(path));
  }

  return [];
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
          ...(profile.lastHealth.message !== undefined
            ? { message: sanitizeHealthMessage(profile.lastHealth.message, profileSecretPaths(profile)) }
            : {}),
          ...(profile.lastHealth.checkedAt !== undefined ? { checkedAt: profile.lastHealth.checkedAt } : {}),
        }
      : null,
  };
}
