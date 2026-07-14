import { EngineManager, getDefaultEngineTargets } from "./engine-manager";
import type { EngineTargetStore } from "./engine-targets/store";
import type {
  CreateEngineTargetPayload,
  DockerBackend,
  EngineSwitcher,
  EngineTargetManager,
  TestEngineTargetPayload,
  UpdateEngineTargetPayload,
} from "./types";

export { getDefaultEngineTargets } from "./engine-manager";

/**
 * Thin DockerBackend adapter over the active engine. Resource operations
 * forward to whatever backend EngineManager currently resolves, so a target
 * switch takes effect without re-wiring routes; target-lifecycle calls forward
 * to the manager. All the real behaviour lives in EngineManager — this class
 * exists only to present the combined DockerBackend + engine-switching surface
 * that createApp wires into the routers.
 */
export class EngineController implements DockerBackend, EngineSwitcher, EngineTargetManager {
  private readonly manager: EngineManager;

  constructor(targets = getDefaultEngineTargets(), initialTargetId?: string, targetStore?: EngineTargetStore) {
    this.manager = new EngineManager(targets, initialTargetId, targetStore);
  }

  // Engine target lifecycle → EngineManager (the deep module).
  listTargets() {
    return this.manager.listTargets();
  }
  selectTarget(targetId: string) {
    return this.manager.selectTarget(targetId);
  }
  createTarget(payload: CreateEngineTargetPayload) {
    return this.manager.createTarget(payload);
  }
  updateTarget(targetId: string, payload: UpdateEngineTargetPayload) {
    return this.manager.updateTarget(targetId, payload);
  }
  deleteTarget(targetId: string) {
    return this.manager.deleteTarget(targetId);
  }
  testTarget(payload: TestEngineTargetPayload) {
    return this.manager.testTarget(payload);
  }
  retestTarget(targetId: string) {
    return this.manager.retestTarget(targetId);
  }
  getEngineInfo() {
    return this.manager.getEngineInfo();
  }

  // Resource operations → the currently-active DockerBackend.
  async listContainers() {
    return (await this.manager.getActiveBackend()).listContainers();
  }
  async getContainerDetails(id: string) {
    return (await this.manager.getActiveBackend()).getContainerDetails(id);
  }
  async getContainerInspect(id: string) {
    return (await this.manager.getActiveBackend()).getContainerInspect(id);
  }
  async getContainerStats(id: string) {
    return (await this.manager.getActiveBackend()).getContainerStats(id);
  }
  async runContainer(payload: Parameters<DockerBackend["runContainer"]>[0]) {
    return (await this.manager.getActiveBackend()).runContainer(payload);
  }
  async startContainer(id: string) {
    return (await this.manager.getActiveBackend()).startContainer(id);
  }
  async stopContainer(id: string) {
    return (await this.manager.getActiveBackend()).stopContainer(id);
  }
  async restartContainer(id: string) {
    return (await this.manager.getActiveBackend()).restartContainer(id);
  }
  async rebuildContainer(id: string) {
    return (await this.manager.getActiveBackend()).rebuildContainer(id);
  }
  async removeContainer(id: string) {
    return (await this.manager.getActiveBackend()).removeContainer(id);
  }
  async startComposeProject(project: string) {
    return (await this.manager.getActiveBackend()).startComposeProject(project);
  }
  async stopComposeProject(project: string) {
    return (await this.manager.getActiveBackend()).stopComposeProject(project);
  }
  async removeComposeProject(project: string) {
    return (await this.manager.getActiveBackend()).removeComposeProject(project);
  }
  async subscribeToContainerLogs(id: string, onChunk: Parameters<DockerBackend["subscribeToContainerLogs"]>[1]) {
    return (await this.manager.getActiveBackend()).subscribeToContainerLogs(id, onChunk);
  }
  async listImages() {
    return (await this.manager.getActiveBackend()).listImages();
  }
  async pullImage(payload: Parameters<DockerBackend["pullImage"]>[0]) {
    return (await this.manager.getActiveBackend()).pullImage(payload);
  }
  async removeImage(id: string) {
    return (await this.manager.getActiveBackend()).removeImage(id);
  }
  async listVolumes() {
    return (await this.manager.getActiveBackend()).listVolumes();
  }
  async createVolume(payload: Parameters<DockerBackend["createVolume"]>[0]) {
    return (await this.manager.getActiveBackend()).createVolume(payload);
  }
  async removeVolume(name: string) {
    return (await this.manager.getActiveBackend()).removeVolume(name);
  }
  async listNetworks() {
    return (await this.manager.getActiveBackend()).listNetworks();
  }
  async createNetwork(payload: Parameters<DockerBackend["createNetwork"]>[0]) {
    return (await this.manager.getActiveBackend()).createNetwork(payload);
  }
  async execContainer(id: string, cols: number, rows: number) {
    return (await this.manager.getActiveBackend()).execContainer(id, cols, rows);
  }
  async removeNetwork(id: string) {
    return (await this.manager.getActiveBackend()).removeNetwork(id);
  }
}
