import { apiRequest } from "./client";
import {
  CreateEngineTargetPayload,
  ContainerSummary,
  ContainerDetails,
  CreateNetworkPayload,
  CreateVolumePayload,
  EngineInfo,
  EngineTarget,
  EngineTargetHealth,
  ImageSummary,
  NetworkSummary,
  PullImagePayload,
  RunContainerPayload,
  SelectEnginePayload,
  TestEngineTargetPayload,
  UpdateEngineTargetPayload,
  VolumeSummary,
} from "./types";

export function getEngineInfo(baseUrl?: string) {
  return apiRequest<EngineInfo>("/api/engine", { baseUrl });
}

export function listEngineTargets() {
  return apiRequest<EngineTarget[]>("/api/engine/targets");
}

export function selectEngineTarget(payload: SelectEnginePayload) {
  return apiRequest<EngineInfo>("/api/engine/select", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createEngineTarget(payload: CreateEngineTargetPayload) {
  return apiRequest<EngineTarget>("/api/engine/targets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEngineTarget(targetId: string, payload: UpdateEngineTargetPayload) {
  return apiRequest<EngineTarget>(`/api/engine/targets/${encodeURIComponent(targetId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEngineTarget(targetId: string) {
  return apiRequest<void>(`/api/engine/targets/${encodeURIComponent(targetId)}`, {
    method: "DELETE",
  });
}

export function testEngineTarget(payload: TestEngineTargetPayload) {
  return apiRequest<EngineTargetHealth>("/api/engine/targets/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function retestEngineTarget(targetId: string) {
  return apiRequest<EngineTargetHealth>(`/api/engine/targets/${encodeURIComponent(targetId)}/test`, {
    method: "POST",
  });
}

export function listContainers() {
  return apiRequest<ContainerSummary[]>("/api/containers");
}

export function getContainerDetails(id: string) {
  return apiRequest<ContainerDetails>(`/api/containers/${encodeURIComponent(id)}`);
}

export function getContainerInspect(id: string) {
  return apiRequest<ContainerDetails["inspect"]>(`/api/containers/${encodeURIComponent(id)}/inspect`);
}

export function getContainerStats(id: string) {
  return apiRequest<ContainerDetails["stats"]>(`/api/containers/${encodeURIComponent(id)}/stats`);
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

export function startComposeProject(project: string) {
  return apiRequest<void>(`/api/containers/compose/${encodeURIComponent(project)}/start`, {
    method: "POST",
  });
}

export function stopComposeProject(project: string) {
  return apiRequest<void>(`/api/containers/compose/${encodeURIComponent(project)}/stop`, {
    method: "POST",
  });
}

export function removeComposeProject(project: string) {
  return apiRequest<void>(`/api/containers/compose/${encodeURIComponent(project)}`, {
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

export function rebuildContainer(id: string) {
  return apiRequest<ContainerSummary>(`/api/containers/${id}/rebuild`, {
    method: "POST",
  });
}
