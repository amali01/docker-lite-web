import { apiRequest } from "./client";
import {
  ContainerSummary,
  CreateNetworkPayload,
  CreateVolumePayload,
  EngineInfo,
  ImageSummary,
  NetworkSummary,
  PullImagePayload,
  RunContainerPayload,
  VolumeSummary,
} from "./types";

export function getEngineInfo(baseUrl?: string) {
  return apiRequest<EngineInfo>("/api/engine", { baseUrl });
}

export function listContainers() {
  return apiRequest<ContainerSummary[]>("/api/containers");
}

export function runContainer(payload: RunContainerPayload) {
  return apiRequest<ContainerSummary>("/api/containers/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function startContainer(id: string) {
  return apiRequest<ContainerSummary>(`/api/containers/${id}/start`, {
    method: "POST",
  });
}

export function stopContainer(id: string) {
  return apiRequest<ContainerSummary>(`/api/containers/${id}/stop`, {
    method: "POST",
  });
}

export function restartContainer(id: string) {
  return apiRequest<ContainerSummary>(`/api/containers/${id}/restart`, {
    method: "POST",
  });
}

export function removeContainer(id: string) {
  return apiRequest<void>(`/api/containers/${id}`, {
    method: "DELETE",
  });
}

export function listImages() {
  return apiRequest<ImageSummary[]>("/api/images");
}

export function pullImage(payload: PullImagePayload) {
  return apiRequest<ImageSummary>("/api/images/pull", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeImage(id: string) {
  return apiRequest<void>(`/api/images/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function listVolumes() {
  return apiRequest<VolumeSummary[]>("/api/volumes");
}

export function createVolume(payload: CreateVolumePayload) {
  return apiRequest<VolumeSummary>("/api/volumes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeVolume(name: string) {
  return apiRequest<void>(`/api/volumes/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export function listNetworks() {
  return apiRequest<NetworkSummary[]>("/api/networks");
}

export function createNetwork(payload: CreateNetworkPayload) {
  return apiRequest<NetworkSummary>("/api/networks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeNetwork(id: string) {
  return apiRequest<void>(`/api/networks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
