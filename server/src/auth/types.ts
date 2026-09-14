import { z } from "zod";

// A truncated or hand-edited config must never load: an empty `jwtSecret`
// signs tokens anyone can forge, an empty `adminPasswordHash` makes every
// login fail forever. Those two are required; everything else degrades to a
// fail-closed default so an older config still opens.
export const MIN_JWT_SECRET_LENGTH = 16;

export const authConfigSchema = z.object({
  adminUsername: z.string().trim().min(1),
  adminPasswordHash: z.string().min(1),
  jwtSecret: z.string().min(MIN_JWT_SECRET_LENGTH),
  authVersion: z.number().int().nonnegative().catch(1),
  // Fail closed: `true` means "still on the built-in default password", which
  // is the safe assumption when the value is missing or garbage.
  defaultCredentialsActive: z.boolean().catch(true),
  // Fail closed: a pre-feature config (or any missing/malformed value) means
  // login is required. Only an explicit `false` disables it — and it is only
  // ever honored on a loopback-bound server; see DockLiteAuth.allowAuthBypass.
  loginRequired: z.boolean().catch(true),
  updatedAt: z.string().catch(""),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;

export interface AuthPathSecurityWarning {
  code: "insecure_path_permissions";
  path: string;
  mode: number;
  message: string;
}
