export interface AuthConfig {
  adminUsername: string;
  adminPasswordHash: string;
  authVersion: number;
  jwtSecret: string;
  defaultCredentialsActive: boolean;
  updatedAt: string;
}

export interface AuthPathSecurityWarning {
  code: "insecure_path_permissions";
  path: string;
  mode: number;
  message: string;
}
