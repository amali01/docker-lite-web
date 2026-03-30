import type {
  ContainerLogsChunk,
  ContainerSummary,
  CreateNetworkPayload,
  CreateVolumePayload,
  EngineInfo,
  ImageSummary,
  NetworkSummary,
  PullImagePayload,
  RunContainerPayload,
  VolumeSummary,
} from "../../src/lib/api/types";

export type {
  ContainerLogsChunk,
  ContainerSummary,
  CreateNetworkPayload,
  CreateVolumePayload,
  EngineInfo,
  ImageSummary,
  NetworkSummary,
  PullImagePayload,
  RunContainerPayload,
  VolumeSummary,
};

export interface DockerBackend {
  getEngineInfo(): Promise<EngineInfo>;
  listContainers(): Promise<ContainerSummary[]>;
  runContainer(payload: RunContainerPayload): Promise<ContainerSummary>;
  startContainer(id: string): Promise<ContainerSummary>;
  stopContainer(id: string): Promise<ContainerSummary>;
  restartContainer(id: string): Promise<ContainerSummary>;
  removeContainer(id: string): Promise<void>;
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
