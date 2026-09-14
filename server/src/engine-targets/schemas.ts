import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

/**
 * TLS and SSH credential paths arrive from the client and are read off the
 * DockLite host's filesystem. Left unconstrained they let a request point the
 * server at any file it can reach: the contents never come back, but the
 * distinct failures for "missing", "unreadable" and "not a key" make the
 * engine-target API a file existence-and-readability oracle. So every such path
 * must resolve inside an allowlisted directory, and the rejection is one fixed
 * message that says nothing about what is or isn't on disk.
 *
 * DOCKLITE_CREDENTIAL_DIRS (a `path.delimiter`-separated list) replaces the
 * defaults, which are the two places credentials normally live: the user's
 * ~/.ssh and DockLite's own credential directory.
 */
export const CREDENTIAL_PATH_MESSAGE = "Credential path is not inside an allowed directory";

export function getCredentialDirectories(): string[] {
  const configured = process.env.DOCKLITE_CREDENTIAL_DIRS;
  const directories = configured
    ? configured.split(delimiter).map((entry) => entry.trim()).filter(Boolean)
    : [join(homedir(), ".ssh"), join(process.cwd(), "server", "data", "credentials")];

  return directories.map((directory) => resolveSymlinks(resolve(directory)));
}

/**
 * realpath() of the deepest existing ancestor, with the not-yet-existing tail
 * appended. This resolves symlinks — so a link inside an allowed directory
 * cannot aim outside it — without requiring the target to exist, which keeps
 * the check from depending on (and therefore leaking) file existence.
 */
function resolveSymlinks(target: string): string {
  const tail: string[] = [];
  let head = target;

  for (;;) {
    try {
      return join(realpathSync(head), ...tail);
    } catch {
      const parent = dirname(head);
      if (parent === head) {
        return target;
      }
      tail.unshift(basename(head));
      head = parent;
    }
  }
}

function isAllowedCredentialPath(value: string): boolean {
  // A relative path would resolve against the server's working directory, which
  // is never what a user means here. `resolve` also collapses "..", so traversal
  // is judged on where the path actually lands, not on how it is spelled.
  if (!isAbsolute(value)) {
    return false;
  }

  const resolved = resolveSymlinks(resolve(value));
  return getCredentialDirectories().some(
    (directory) => resolved === directory || resolved.startsWith(directory + sep),
  );
}

/** A client-supplied path to a TLS certificate/key or an SSH key/known_hosts file. */
export const credentialPathSchema = nonEmptyString.refine(isAllowedCredentialPath, {
  message: CREDENTIAL_PATH_MESSAGE,
});

export const engineTargetKindSchema = z.union([z.literal("local"), z.literal("ssh"), z.literal("tcpTls")]);
export const engineTargetHealthStatusSchema = z.union([
  z.literal("healthy"),
  z.literal("degraded"),
  z.literal("unhealthy"),
  z.literal("unknown"),
]);
export const engineTargetSourceSchema = z.union([z.literal("builtin"), z.literal("saved")]);

export const engineTargetHealthSchema = z
  .object({
    status: engineTargetHealthStatusSchema,
    message: z.string().optional(),
    checkedAt: z.string().datetime().optional(),
  })
  .strict();

const engineTargetBaseProfileSchema = z
  .object({
    id: nonEmptyString,
    label: nonEmptyString,
    kind: engineTargetKindSchema,
    source: engineTargetSourceSchema,
    enabled: z.boolean(),
    lastHealth: engineTargetHealthSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const localEngineTargetProfileSchema = engineTargetBaseProfileSchema
  .extend({
    kind: z.literal("local"),
    connection: z
      .object({
        socketPath: nonEmptyString,
      })
      .strict(),
  })
  .strict();

const sshEngineTargetProfileSchema = engineTargetBaseProfileSchema
  .extend({
    kind: z.literal("ssh"),
    connection: z
      .object({
        host: nonEmptyString,
        port: z.number().int().positive(),
      })
      .strict(),
    ssh: z
      .object({
        username: nonEmptyString,
        authMode: z.union([z.literal("agent"), z.literal("keyFile")]),
        keyPath: z.string().trim().min(1).nullable(),
        knownHostsPath: z.string().trim().min(1).nullable(),
        dockerHostOverride: z.string().trim().min(1).nullable(),
      })
      .strict(),
  })
  .strict();

const tcpTlsEngineTargetProfileSchema = engineTargetBaseProfileSchema
  .extend({
    kind: z.literal("tcpTls"),
    connection: z
      .object({
        host: nonEmptyString,
        port: z.number().int().positive(),
      })
      .strict(),
    tls: z
      .object({
        serverName: z.string().trim().min(1).nullable(),
        tlsMode: z.union([z.literal("serverOnly"), z.literal("mtls")]),
        caPath: z.string().trim().min(1).nullable(),
        certPath: z.string().trim().min(1).nullable(),
        keyPath: z.string().trim().min(1).nullable(),
      })
      .strict(),
  })
  .strict();

export const engineTargetProfileSchema = z.union([
  localEngineTargetProfileSchema,
  sshEngineTargetProfileSchema,
  tcpTlsEngineTargetProfileSchema,
]);

export const engineTargetProfileInputSchema = z.union([
  z
    .object({
      id: z.string().trim().min(1).optional(),
      label: nonEmptyString,
      kind: z.literal("local"),
      enabled: z.boolean().optional(),
      lastHealth: engineTargetHealthSchema.nullable().optional(),
      connection: z
        .object({
          socketPath: nonEmptyString,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: z.string().trim().min(1).optional(),
      label: nonEmptyString,
      kind: z.literal("ssh"),
      enabled: z.boolean().optional(),
      lastHealth: engineTargetHealthSchema.nullable().optional(),
      connection: z
        .object({
          host: nonEmptyString,
          port: z.number().int().positive(),
        })
        .strict(),
      ssh: z
        .object({
          username: nonEmptyString,
          authMode: z.union([z.literal("agent"), z.literal("keyFile")]),
          keyPath: z.string().trim().min(1).nullable().optional(),
          knownHostsPath: z.string().trim().min(1).nullable().optional(),
          dockerHostOverride: z.string().trim().min(1).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: z.string().trim().min(1).optional(),
      label: nonEmptyString,
      kind: z.literal("tcpTls"),
      enabled: z.boolean().optional(),
      lastHealth: engineTargetHealthSchema.nullable().optional(),
      connection: z
        .object({
          host: nonEmptyString,
          port: z.number().int().positive(),
        })
        .strict(),
      tls: z
        .object({
          serverName: z.string().trim().min(1).nullable().optional(),
          tlsMode: z.union([z.literal("serverOnly"), z.literal("mtls")]),
          caPath: z.string().trim().min(1).nullable().optional(),
          certPath: z.string().trim().min(1).nullable().optional(),
          keyPath: z.string().trim().min(1).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
]);

export const engineTargetStoreStateSchema = z
  .object({
    version: z.number().int().positive().optional(),
    activeTargetId: z.string().trim().min(1).nullable(),
    savedTargets: z.array(engineTargetProfileSchema),
  })
  .strict();

/**
 * Single source of truth for the "plain TCP is not supported" rejection. Both
 * the schema path (ZodError) and the connection tester (BackendError) throw
 * with this exact code/message so classification never depends on matching
 * error text.
 */
export const INSECURE_TCP_CODE = "insecure_tcp_not_supported" as const;
export const INSECURE_TCP_MESSAGE = "Plain TCP Docker targets are not supported. Use tcpTls instead.";

export function parseEngineTargetProfileInput(input: unknown) {
  if (
    typeof input === "object" &&
    input !== null &&
    "kind" in input &&
    (input as { kind?: unknown }).kind === "tcp"
  ) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["kind"],
        message: INSECURE_TCP_MESSAGE,
      },
    ]);
  }

  return engineTargetProfileInputSchema.parse(input);
}
