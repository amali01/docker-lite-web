import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import Dashboard from "@/pages/Dashboard";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();

describe("Dashboard", () => {
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
          })),
        );
      }

      if (url.endsWith("/api/containers") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify([
            { id: "1", name: "nginx-proxy", image: "nginx:alpine", status: "running", state: "Up", ports: "80/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: "20 MB", memLimit: "512 MB", netIO: null, blockIO: null },
            { id: "2", name: "postgres-db", image: "postgres:16", status: "stopped", state: "Exited", ports: "", created: new Date().toISOString(), cpuPercent: null, memUsage: null, memLimit: null, netIO: null, blockIO: null },
          ])),
        );
      }

      if (url.includes("/api/containers/2/start") && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({
            id: "2",
            name: "postgres-db",
            image: "postgres:16",
            status: "running",
            state: "Up just now",
            ports: "",
            created: new Date().toISOString(),
            cpuPercent: null,
            memUsage: null,
            memLimit: null,
            netIO: null,
            blockIO: null,
          })),
        );
      }

      if (url.endsWith("/api/images")) {
        return Promise.resolve(new Response(JSON.stringify([{ id: "img-1", repository: "nginx", tag: "alpine", size: "40 MB", created: "2026-03-30" }])));
      }

      if (url.endsWith("/api/volumes")) {
        return Promise.resolve(new Response(JSON.stringify([{ name: "postgres-data", driver: "local", mountpoint: "/var/lib/docker/volumes/postgres-data", created: "2026-03-30", size: "1 GB", inUse: true }])));
      }

      if (url.endsWith("/api/networks")) {
        return Promise.resolve(new Response(JSON.stringify([{ id: "net-1", name: "bridge", driver: "bridge", scope: "local", subnet: "172.17.0.0/16", gateway: "172.17.0.1", containers: 2 }])));
      }

      return Promise.reject(new Error(`Unhandled URL ${url}`));
    });
  });

  it("renders dashboard heading", async () => {
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("shows container stats", async () => {
    renderWithProviders(<Dashboard />);
    expect(await screen.findAllByText("Containers")).not.toHaveLength(0);
    expect(screen.getAllByText("Images").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Volumes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Networks").length).toBeGreaterThan(0);
  });

  it("shows system information", async () => {
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText("System Information")).toBeInTheDocument();
    expect(screen.getByText(/26.1.0/)).toBeInTheDocument();
  });

  it("renders container rows", async () => {
    renderWithProviders(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
      expect(screen.getByText("postgres-db")).toBeInTheDocument();
    });
  });

  it("shows dashboard container actions", async () => {
    renderWithProviders(<Dashboard />);
    const rowText = await screen.findByText("postgres-db");
    const row = rowText.closest("tr");
    expect(row).not.toBeNull();
    const rowQueries = within(row!);
    expect(rowQueries.getByTitle("Start")).toBeInTheDocument();
    expect(rowQueries.getByTitle("Restart")).toBeInTheDocument();
    expect(rowQueries.getByTitle("Logs")).toBeInTheDocument();
    expect(rowQueries.getByTitle("Remove")).toBeInTheDocument();
  });

  it("starts a container from the dashboard", async () => {
    renderWithProviders(<Dashboard />);
    const rowText = await screen.findByText("postgres-db");
    const row = rowText.closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByTitle("Start"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/containers/2/start"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
