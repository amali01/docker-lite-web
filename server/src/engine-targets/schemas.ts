import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

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
