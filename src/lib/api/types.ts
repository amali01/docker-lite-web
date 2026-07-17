export type ContainerStatus = "running" | "stopped" | "paused" | "restarting";

export interface EngineInfo {
  connected: boolean;
  dockerVersion: string;
  apiVersion: string;
  os: string;
  arch: string;
  kernelVersion: string;
  totalMemory: string;
  cpus: number;
  storageDriver: string;
  rootDir: string;
  serverTime: string;
  endpoint: string;
  selectedEngineId?: string;
  errorMessage?: string;
}

export type EngineTargetKind = "local" | "ssh" | "tcpTls";
export type EngineTargetHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
export type EngineTargetSource = "builtin" | "saved";

export interface EngineTargetHealth {
  status: EngineTargetHealthStatus;
  message?: string;
  checkedAt?: string;
}

export interface EngineTarget {
  id: string;
  label: string;
  endpoint: string;
  active: boolean;
  available: boolean;
  kind: EngineTargetKind;
  source: EngineTargetSource;
  lastHealth: EngineTargetHealth | null;
}

export interface SelectEnginePayload {
  targetId: string;
}

export interface LocalEngineTargetPayload {
  kind: "local";
  label: string;
  socketPath: string;
}

export interface LocalEngineTargetUpdatePayload {
  kind: "local";
  label?: string;
  socketPath?: string;
}

export interface SshEngineTargetPayload {
  kind: "ssh";
  label: string;
  host: string;
  port: number;
  username: string;
  authMode: "agent" | "keyFile";
  keyPath?: string | null;
  knownHostsPath?: string | null;
  dockerHostOverride?: string | null;
}

export interface SshEngineTargetUpdatePayload {
  kind: "ssh";
  label?: string;
  host?: string;
  port?: number;
  username?: string;
  authMode?: "agent" | "keyFile";
  keyPath?: string | null;
  knownHostsPath?: string | null;
  dockerHostOverride?: string | null;
}

export interface TcpTlsEngineTargetPayload {
  kind: "tcpTls";
  label: string;
  host: string;
  port: number;
  serverName?: string | null;
  tlsMode: "serverOnly" | "mtls";
  caPath?: string | null;
  certPath?: string | null;
  keyPath?: string | null;
}

export interface TcpTlsEngineTargetUpdatePayload {
  kind: "tcpTls";
  label?: string;
  host?: string;
  port?: number;
  serverName?: string | null;
  tlsMode?: "serverOnly" | "mtls";
  caPath?: string | null;
  certPath?: string | null;
  keyPath?: string | null;
}

export type CreateEngineTargetPayload =
  | LocalEngineTargetPayload
  | SshEngineTargetPayload
  | TcpTlsEngineTargetPayload;

export type UpdateEngineTargetPayload =
  | LocalEngineTargetUpdatePayload
  | SshEngineTargetUpdatePayload
  | TcpTlsEngineTargetUpdatePayload;

export type TestEngineTargetPayload = CreateEngineTargetPayload;

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  composeProject: string | null;
  composeService: string | null;
  status: ContainerStatus;
  state: string;
  ports: string;
  created: string;
  cpuPercent: number | null;
  memUsage: string | null;
  memPercent: number | null;
  netIO: string | null;
  memLimit: string | null;
  blockIO: string | null;
}

export interface ContainerMountSummary {
  source: string;
  destination: string;
  type: string;
  readOnly: boolean;
  propagation: string | null;
}

export interface ContainerPortBinding {
  ip: string | null;
  privatePort: number;
  publicPort: number | null;
  protocol: "tcp" | "udp";
}

export interface ContainerLabelEntry {
  key: string;
  value: string;
}

export interface ContainerInspectView {
  raw: Record<string, unknown>;
}

export interface ContainerStatsSample {
  sampledAt: string;
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number | null;
}

export interface ContainerDetails {
  summary: ContainerSummary;
  mounts: ContainerMountSummary[];
  ports: ContainerPortBinding[];
  labels: ContainerLabelEntry[];
  inspect: ContainerInspectView;
  stats: ContainerStatsSample[];
}

export interface ImageSummary {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export interface VolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  size: string;
  inUse: boolean;
}

export interface NetworkSummary {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  gateway: string;
  containers: number;
}

export interface KeyValueInput {
  key: string;
  value: string;
}

export interface PortMappingInput {
  host: string;
  container: string;
  protocol?: "tcp" | "udp";
}

export interface VolumeMountInput {
  source: string;
  target: string;
  readOnly?: boolean;
}

export interface RunContainerPayload {
  image: string;
  name?: string;
  ports: PortMappingInput[];
  envVars: KeyValueInput[];
  volumes: VolumeMountInput[];
}

export interface PullImagePayload {
  image: string;
}

export interface CreateVolumePayload {
  name: string;
}

export interface CreateNetworkPayload {
  name: string;
  driver?: string;
}

export interface ContainerLogLine {
  time: string;
  msg: string;
}

export interface ContainerLogsChunk {
  containerId: string;
  lines: ContainerLogLine[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

export interface AuthConfigView {
  adminUsername: string;
  defaultCredentialsActive: boolean;
  loginRequired: boolean;
  // Whether login may be disabled at all — true only on a loopback instance.
  canDisableLogin: boolean;
}

export interface AuthSessionState {
  authenticated: boolean;
  username: string | null;
  expiresAt: string | null;
  defaultCredentialsActive: boolean;
  message: string | null;
}

export interface AuthLoginPayload {
  username: string;
  password: string;
}

export interface AuthLoginResponse {
  username: string;
  token: string;
  expiresAt: string;
  defaultCredentialsActive: boolean;
}

export interface UpdateCredentialsPayload {
  username: string;
  password: string;
}
