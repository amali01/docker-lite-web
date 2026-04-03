import type {
  CreateEngineTargetPayload,
  ContainerLogsChunk,
  ContainerDetails,
  ContainerInspectView,
  ContainerLabelEntry,
  ContainerMountSummary,
  ContainerPortBinding,
  ContainerStatsSample,
  ContainerSummary,
  CreateNetworkPayload,
  CreateVolumePayload,
  EngineInfo,
  TestEngineTargetPayload,
  ImageSummary,
  NetworkSummary,
  PullImagePayload,
  RunContainerPayload,
  SelectEnginePayload,
  UpdateEngineTargetPayload,
  VolumeSummary,
} from "../../src/lib/api/types";
import type {
  EngineTargetHealth,
  EngineTargetHealthStatus,
  EngineTarget as PublicEngineTarget,
  EngineTargetKind,
  EngineTargetProfile,
  EngineTargetProfileInput,
  EngineTargetSource,
  EngineTargetStoreState,
} from "./engine-targets/types";
import type {
  AuthConfig,
  AuthPathSecurityWarning,
} from "./auth/types";

export type {
  ContainerLogsChunk,
  ContainerDetails,
  ContainerInspectView,
  ContainerLabelEntry,
  ContainerMountSummary,
  ContainerPortBinding,
  ContainerStatsSample,
  ContainerSummary,
  CreateEngineTargetPayload,
  CreateNetworkPayload,
  CreateVolumePayload,
  EngineInfo,
  EngineTargetHealth,
  EngineTargetHealthStatus,
  EngineTargetKind,
  EngineTargetProfile,
  EngineTargetProfileInput,
  EngineTargetSource,
  EngineTargetStoreState,
  ImageSummary,
  NetworkSummary,
  PullImagePayload,
  RunContainerPayload,
  SelectEnginePayload,
  TestEngineTargetPayload,
  UpdateEngineTargetPayload,
  VolumeSummary,
  AuthConfig,
  AuthPathSecurityWarning,
};

export type EngineTarget = PublicEngineTarget;

export interface ExecSession {
  stream: NodeJS.ReadWriteStream;
  exec: {
    resize(options: { w: number; h: number }): Promise<void>;
  };
}

export interface DockerBackend {
  getEngineInfo(): Promise<EngineInfo>;
  listContainers(): Promise<ContainerSummary[]>;
  getContainerDetails(id: string): Promise<ContainerDetails>;
  getContainerInspect(id: string): Promise<ContainerInspectView>;
  getContainerStats(id: string): Promise<ContainerStatsSample[]>;
  runContainer(payload: RunContainerPayload): Promise<ContainerSummary>;
  startContainer(id: string): Promise<ContainerSummary>;
  stopContainer(id: string): Promise<ContainerSummary>;
  restartContainer(id: string): Promise<ContainerSummary>;
  rebuildContainer(id: string): Promise<ContainerSummary>;
  removeContainer(id: string): Promise<void>;
  startComposeProject(project: string): Promise<void>;
  stopComposeProject(project: string): Promise<void>;
  removeComposeProject(project: string): Promise<void>;
  subscribeToContainerLogs(id: string, onChunk: (chunk: ContainerLogsChunk) => void): Promise<() => void>;
  listImages(): Promise<ImageSummary[]>;
  pullImage(payload: PullImagePayload): Promise<ImageSummary>;
  removeImage(id: string): Promise<void>;
  listVolumes(): Promise<VolumeSummary[]>;
  createVolume(payload: CreateVolumePayload): Promise<VolumeSummary>;
  removeVolume(name: string): Promise<void>;
  listNetworks(): Promise<NetworkSummary[]>;
  createNetwork(payload: CreateNetworkPayload): Promise<NetworkSummary>;
  removeNetwork(id: string): Promise<void>;
  execContainer(id: string, cols: number, rows: number): Promise<ExecSession>;
}

export interface EngineSwitcher {
  listTargets(): Promise<EngineTarget[]>;
  selectTarget(targetId: string): Promise<EngineInfo>;
}

export interface EngineTargetManager {
  createTarget(payload: CreateEngineTargetPayload): Promise<EngineTarget>;
  updateTarget(targetId: string, payload: UpdateEngineTargetPayload): Promise<EngineTarget>;
  deleteTarget(targetId: string): Promise<void>;
  testTarget(payload: TestEngineTargetPayload): Promise<EngineTargetHealth>;
  retestTarget(targetId: string): Promise<EngineTargetHealth>;
}

export class BackendError extends Error {
  status: number;
  code: string;
  details?: string;

  constructor(status: number, code: string, message: string, details?: string) {
    super(message);
    this.name = "BackendError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
