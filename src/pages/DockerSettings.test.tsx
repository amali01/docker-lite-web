import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import DockerSettings from "@/pages/DockerSettings";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();

describe("DockerSettings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/engine") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({
            connected: true,
            dockerVersion: "26.1.0",
            apiVersion: "1.45",
            os: "Linux",
            arch: "x86_64",
            kernelVersion: "6.8.0",
            totalMemory: "32 GB",
            cpus: 12,
            storageDriver: "overlay2",
            rootDir: "/var/lib/docker",
            serverTime: new Date().toISOString(),
            endpoint: "unix:///var/run/docker.sock",
            selectedEngineId: "system",
          })),
        );
      }

      if (url.endsWith("/api/engine/targets") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify([
            { id: "system", label: "System Docker", endpoint: "unix:///var/run/docker.sock", active: true, available: true },
            { id: "desktop-linux", label: "Docker Desktop", endpoint: "unix:///home/amali/.docker/desktop/docker.sock", active: false, available: true },
          ])),
        );
      }

      if (url.endsWith("/api/engine/select") && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({
            connected: true,
            dockerVersion: "26.1.0",
            apiVersion: "1.45",
            os: "Linux",
            arch: "x86_64",
            kernelVersion: "6.8.0",
            totalMemory: "32 GB",
            cpus: 12,
            storageDriver: "overlay2",
            rootDir: "/var/lib/docker",
            serverTime: new Date().toISOString(),
            endpoint: "unix:///home/amali/.docker/desktop/docker.sock",
            selectedEngineId: "desktop-linux",
          })),
        );
      }

      return Promise.reject(new Error(`Unhandled ${method} ${url}`));
    });
  });

  it("shows available docker engines and lets the user switch", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByText("System Docker")).toBeInTheDocument();
    expect(screen.getByText("Docker Desktop")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Docker Desktop" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/engine/select"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("associates settings fields with accessible labels", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByLabelText("Backend Base URL")).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: "System Docker" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Docker Desktop" })).toBeInTheDocument();
    expect(screen.getByLabelText("Docker Endpoint")).toBeInTheDocument();
    expect(screen.getByLabelText("API Version")).toBeInTheDocument();
  });
});
