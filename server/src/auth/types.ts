export interface AuthConfig {
  adminUsername: string;
  adminPasswordHash: string;
  authVersion: number;
  jwtSecret: string;
  defaultCredentialsActive: boolean;
  // When false, the login requirement is disabled (auth bypass) — only ever
  // honored on a loopback-bound server; see DockLiteAuth.allowAuthBypass.
  loginRequired: boolean;
  updatedAt: string;
}

export interface AuthPathSecurityWarning {
  code: "insecure_path_permissions";
  path: string;
  mode: number;
  message: string;
}
