export interface AuthConfig {
  authEnabled: boolean;
  adminPasswordHash: string | null;
  passwordUpdatedAt: string | null;
  passwordVersion: number;
  sessionIdleTimeoutMinutes: number;
  sessionAbsoluteTimeoutHours: number;
  httpsEnabled: boolean;
  tlsCertPath: string | null;
  tlsKeyPath: string | null;
}

export interface AuthBootstrapState {
  hasPassword: boolean;
  requiresBootstrap: boolean;
  passwordUpdatedAt: string | null;
  passwordVersion: number;
}

export interface AuthPathSecurityWarning {
  code: "insecure_path_permissions";
  path: string;
  mode: number;
  message: string;
}

export interface CreateSessionInput {
  passwordVersion: number;
  idleTimeoutMinutes: number;
  absoluteTimeoutHours: number;
  remoteAddress?: string | null;
  userAgent?: string | null;
}

export interface AuthSession {
  id: string;
  csrfToken: string;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  expiresAt: string;
  passwordVersion: number;
  remoteAddress: string | null;
  userAgent: string | null;
}

export interface GetSessionOptions {
  currentPasswordVersion: number;
  touch?: boolean;
}

export type AuthRequestChannel = "http" | "sse" | "ws";

export type BrowserOriginTrust = "absent" | "trusted" | "untrusted";

export interface ClassifyRequestInput {
  channel: AuthRequestChannel;
  protocol: "http" | "https";
  remoteAddress: string | null | undefined;
  headers?: Record<string, string | string[] | undefined>;
}

export interface AuthRequestClassification {
  access: "local" | "remote";
  channel: AuthRequestChannel;
  isLoopback: boolean;
  browserOrigin: BrowserOriginTrust;
  reason: string;
}
