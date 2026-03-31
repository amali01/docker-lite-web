import type { EngineTarget as PublicEngineTarget } from "../../../src/lib/api/types";

export type EngineTargetKind = "local" | "ssh" | "tcpTls";
export type EngineTargetHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
export type EngineTargetSource = "builtin" | "saved";

export interface EngineTargetHealth {
  status: EngineTargetHealthStatus;
  message?: string;
  checkedAt?: string;
}

export interface EngineTargetBaseProfile {
  id: string;
  label: string;
  kind: EngineTargetKind;
  source: EngineTargetSource;
  enabled: boolean;
  lastHealth: EngineTargetHealth | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalEngineTargetProfile extends EngineTargetBaseProfile {
  kind: "local";
  connection: {
    socketPath: string;
  };
}

export interface SshEngineTargetProfile extends EngineTargetBaseProfile {
  kind: "ssh";
  connection: {
    host: string;
    port: number;
  };
  ssh: {
    username: string;
    authMode: "agent" | "keyFile";
    keyPath: string | null;
    knownHostsPath: string | null;
    dockerHostOverride: string | null;
  };
}

export interface TcpTlsEngineTargetProfile extends EngineTargetBaseProfile {
  kind: "tcpTls";
  connection: {
    host: string;
    port: number;
  };
  tls: {
    serverName: string | null;
    tlsMode: "serverOnly" | "mtls";
    caPath: string | null;
    certPath: string | null;
    keyPath: string | null;
  };
}

export type EngineTargetProfile =
  | LocalEngineTargetProfile
  | SshEngineTargetProfile
  | TcpTlsEngineTargetProfile;

export interface LocalEngineTargetInput {
  id?: string;
  label: string;
  kind: "local";
  enabled?: boolean;
  lastHealth?: EngineTargetHealth | null;
  connection: {
    socketPath: string;
  };
}

export interface SshEngineTargetInput {
  id?: string;
  label: string;
  kind: "ssh";
  enabled?: boolean;
  lastHealth?: EngineTargetHealth | null;
  connection: {
    host: string;
    port: number;
  };
  ssh: {
    username: string;
    authMode: "agent" | "keyFile";
    keyPath?: string | null;
    knownHostsPath?: string | null;
    dockerHostOverride?: string | null;
  };
}

export interface TcpTlsEngineTargetInput {
  id?: string;
  label: string;
  kind: "tcpTls";
  enabled?: boolean;
  lastHealth?: EngineTargetHealth | null;
  connection: {
    host: string;
    port: number;
  };
  tls: {
    serverName?: string | null;
    tlsMode: "serverOnly" | "mtls";
    caPath?: string | null;
    certPath?: string | null;
    keyPath?: string | null;
  };
}

export type EngineTargetProfileInput =
  | LocalEngineTargetInput
  | SshEngineTargetInput
  | TcpTlsEngineTargetInput;

export interface EngineTargetStoreState {
  activeTargetId: string | null;
  savedTargets: EngineTargetProfile[];
}

export type EngineTarget = PublicEngineTarget;
