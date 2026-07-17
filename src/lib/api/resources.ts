import { apiRequest } from "./client";
import {
  AuthConfigView,
  AuthLoginPayload,
  AuthLoginResponse,
  AuthSessionState,
  ContainerDetails,
  ContainerSummary,
  CreateEngineTargetPayload,
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
  UpdateCredentialsPayload,
  UpdateEngineTargetPayload,
  VolumeSummary,
} from "./types";

export function getAuthSession() {
  return apiRequest<AuthSessionState>("/api/auth/session", { auth: true });
}

export function login(payload: AuthLoginPayload) {
  return apiRequest<AuthLoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return apiRequest<void>("/api/auth/logout", {
    auth: true,
    method: "POST",
  });
}

export function shutdownServer() {
  return apiRequest<{ stopping: boolean }>("/api/shutdown", {
    auth: true,
    method: "POST",
  });
}

export function setLoginRequired(required: boolean) {
  return apiRequest<AuthConfigView>("/api/auth/login-required", {
    auth: true,
    method: "POST",
    body: JSON.stringify({ required }),
  });
}

export function getAuthConfig() {
  return apiRequest<AuthConfigView>("/api/auth/config", {
    auth: true,
  });
}

export function updateCredentials(payload: UpdateCredentialsPayload) {
  return apiRequest<AuthLoginResponse>("/api/auth/credentials", {
    auth: true,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEngineInfo(baseUrl?: string) {
  return apiRequest<EngineInfo>("/api/engine", { baseUrl, auth: true });
}

export function listEngineTargets() {
  return apiRequest<EngineTarget[]>("/api/engine/targets", { auth: true });
}

export function selectEngineTarget(payload: SelectEnginePayload) {
  return apiRequest<EngineInfo>("/api/engine/select", {
    auth: true,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createEngineTarget(payload: CreateEngineTargetPayload) {
  return apiRequest<EngineTarget>("/api/engine/targets", {
    auth: true,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEngineTarget(targetId: string, payload: UpdateEngineTargetPayload) {
  return apiRequest<EngineTarget>(`/api/engine/targets/${encodeURIComponent(targetId)}`, {
    auth: true,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEngineTarget(targetId: string) {
  return apiRequest<void>(`/api/engine/targets/${encodeURIComponent(targetId)}`, {
    auth: true,
    method: "DELETE",
  });
}

export function testEngineTarget(payload: TestEngineTargetPayload) {
  return apiRequest<EngineTargetHealth>("/api/engine/targets/test", {
    auth: true,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function retestEngineTarget(targetId: string) {
  return apiRequest<EngineTargetHealth>(`/api/engine/targets/${encodeURIComponent(targetId)}/test`, {
    auth: true,
    method: "POST",
  });
}

export function listContainers() {
  return apiRequest<ContainerSummary[]>("/api/containers", { auth: true });
}

export function getContainerDetails(id: string) {
  return apiRequest<ContainerDetails>(`/api/containers/${encodeURIComponent(id)}`, { auth: true });
}

export function getContainerInspect(id: string) {
  return apiRequest<ContainerDetails["inspect"]>(`/api/containers/${encodeURIComponent(id)}/inspect`, { auth: true });
}

export function getContainerStats(id: string) {
  return apiRequest<ContainerDetails["stats"]>(`/api/containers/${encodeURIComponent(id)}/stats`, { auth: true });
}

export function runContainer(payload: RunContainerPayload) {
  return apiRequest<ContainerSummary>("/api/containers/run", {
    auth: true,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function startContainer(id: string) {
  return apiRequest<ContainerSummary>(`/api/containers/${id}/start`, {
    auth: true,
    method: "POST",
  });
}

export function stopContainer(id: string) {
  return apiRequest<ContainerSummary>(`/api/containers/${id}/stop`, {
    auth: true,
    method: "POST",
  });
}

export function restartContainer(id: string) {
  return apiRequest<ContainerSummary>(`/api/containers/${id}/restart`, {
    auth: true,
    method: "POST",
  });
}

export function rebuildContainer(id: string) {
  return apiRequest<ContainerSummary>(`/api/containers/${id}/rebuild`, {
    auth: true,
    method: "POST",
  });
}

export function removeContainer(id: string) {
  return apiRequest<void>(`/api/containers/${id}`, {
    auth: true,
    method: "DELETE",
  });
}

export function startComposeProject(project: string) {
  return apiRequest<void>(`/api/containers/compose/${encodeURIComponent(project)}/start`, {
    auth: true,
    method: "POST",
  });
}

export function stopComposeProject(project: string) {
  return apiRequest<void>(`/api/containers/compose/${encodeURIComponent(project)}/stop`, {
    auth: true,
    method: "POST",
  });
}

export function removeComposeProject(project: string) {
  return apiRequest<void>(`/api/containers/compose/${encodeURIComponent(project)}`, {
    auth: true,
    method: "DELETE",
  });
}

export function listImages() {
  return apiRequest<ImageSummary[]>("/api/images", { auth: true });
}

export function pullImage(payload: PullImagePayload) {
  return apiRequest<ImageSummary>("/api/images/pull", {
    auth: true,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeImage(id: string) {
  return apiRequest<void>(`/api/images/${encodeURIComponent(id)}`, {
    auth: true,
    method: "DELETE",
  });
}

export function listVolumes() {
  return apiRequest<VolumeSummary[]>("/api/volumes", { auth: true });
}

export function createVolume(payload: CreateVolumePayload) {
  return apiRequest<VolumeSummary>("/api/volumes", {
    auth: true,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeVolume(name: string) {
  return apiRequest<void>(`/api/volumes/${encodeURIComponent(name)}`, {
    auth: true,
    method: "DELETE",
  });
}

export function listNetworks() {
  return apiRequest<NetworkSummary[]>("/api/networks", { auth: true });
}

export function createNetwork(payload: CreateNetworkPayload) {
  return apiRequest<NetworkSummary>("/api/networks", {
    auth: true,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeNetwork(id: string) {
  return apiRequest<void>(`/api/networks/${encodeURIComponent(id)}`, {
    auth: true,
    method: "DELETE",
  });
}
