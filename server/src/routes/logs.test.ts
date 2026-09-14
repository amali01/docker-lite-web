import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthConfigStore } from "../auth/config";
import { DockLiteAuth } from "../auth/middleware";
import type { DockerBackend } from "../types";
import { createLogsRouter } from "./logs";

function notImplemented(): never {
  throw new Error("not implemented in test stub");
}

function createStubBackend(overrides: Partial<DockerBackend>): DockerBackend {
  return {
    getEngineInfo: notImplemented,
    listContainers: notImplemented,
    getContainerDetails: notImplemented,
    getContainerInspect: notImplemented,
    getContainerStats: notImplemented,
    runContainer: notImplemented,
    startContainer: notImplemented,
    stopContainer: notImplemented,
    restartContainer: notImplemented,
    rebuildContainer: notImplemented,
    removeContainer: notImplemented,
    startComposeProject: notImplemented,
    stopComposeProject: notImplemented,
    removeComposeProject: notImplemented,
    subscribeToContainerLogs: notImplemented,
    listImages: notImplemented,
    pullImage: notImplemented,
    removeImage: notImplemented,
    listVolumes: notImplemented,
    createVolume: notImplemented,
    removeVolume: notImplemented,
    listNetworks: notImplemented,
    createNetwork: notImplemented,
    removeNetwork: notImplemented,
    execContainer: notImplemented,
    ...overrides,
  };
}

// Minimal fake request/response: enough surface for the handler under test,
// nothing more (no real HTTP socket, no Express dispatch).
function createFakeRequest(): Request {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    headers: {},
    url: "/containers/abc/logs/stream",
    originalUrl: "/containers/abc/logs/stream",
    params: { id: "abc" },
    destroyed: false,
  }) as unknown as Request;
}

function createFakeResponse(): Response & { writableEnded: boolean } {
  const response = {
    writableEnded: false,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(function end(this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
  };
  return response as unknown as Response & { writableEnded: boolean };
}

async function getStreamHandler(backend: DockerBackend) {
  const dir = await mkdtemp(join(tmpdir(), "docklite-logs-test-"));
  const auth = new DockLiteAuth({
    configStore: new AuthConfigStore({ filePath: join(dir, "auth-config.json"), env: {} }),
    allowAuthBypass: true,
  });
  const router = createLogsRouter(async () => backend, auth);
  const layer = router.stack.find(
    (candidate) => (candidate as { route?: { path: string } }).route?.path === "/containers/:id/logs/stream",
  ) as { route: { stack: Array<{ handle: (req: Request, res: Response, next: (error?: unknown) => void) => unknown }> } };
  const handle = layer.route.stack[0].handle;

  return { handle, dir };
}

describe("GET /containers/:id/logs/stream", () => {
  const dirsToClean: string[] = [];

  afterEach(async () => {
    await Promise.all(dirsToClean.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
    vi.restoreAllMocks();
  });

  it("tears down the subscription and never starts a heartbeat when the client aborts mid-subscribe", async () => {
    const unsubscribe = vi.fn();
    let resolveSubscribe!: (fn: () => void) => void;
    const subscribePromise = new Promise<() => void>((resolve) => {
      resolveSubscribe = resolve;
    });

    const request = createFakeRequest();
    const response = createFakeResponse();
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    const subscribeToContainerLogs = vi.fn(async () => {
      // Simulate the client aborting while this call is still in flight: the
      // "close" event fires once, synchronously, before we return.
      request.emit("close");
      return subscribePromise;
    });

    const { handle, dir } = await getStreamHandler(createStubBackend({ subscribeToContainerLogs }));
    dirsToClean.push(dir);

    const next = vi.fn();
    const handlerDone = handle(request, response, next);

    // The handler is now parked awaiting the (still-pending) subscribe
    // promise, exactly as it would be if the backend was slow to respond.
    resolveSubscribe(unsubscribe);
    await handlerDone;

    expect(next).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it("cleans up exactly once on a normal close after streaming starts", async () => {
    const unsubscribe = vi.fn();
    const subscribeToContainerLogs = vi.fn(async () => unsubscribe);

    const request = createFakeRequest();
    const response = createFakeResponse();
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    const { handle, dir } = await getStreamHandler(createStubBackend({ subscribeToContainerLogs }));
    dirsToClean.push(dir);

    const next = vi.fn();
    await handle(request, response, next);

    expect(unsubscribe).not.toHaveBeenCalled();

    request.emit("close");
    request.emit("close"); // a duplicate close must not double-clean

    expect(next).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(response.end).toHaveBeenCalledTimes(1);
  });
});
