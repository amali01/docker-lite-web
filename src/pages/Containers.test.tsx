import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import Containers from "@/pages/Containers";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();

const containers = [
  { id: "ctr-1", name: "nginx-proxy", image: "nginx:alpine", status: "running", state: "Up 3 hours", ports: "80/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: "20 MB", memLimit: "512 MB", netIO: null, blockIO: null },
  { id: "ctr-2", name: "postgres-db", image: "postgres:16", status: "stopped", state: "Exited", ports: "5432/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: null, memLimit: null, netIO: null, blockIO: null },
  { id: "ctr-3", name: "redis-cache", image: "redis:7-alpine", status: "running", state: "Up 1 hour", ports: "6379/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: "10 MB", memLimit: "256 MB", netIO: null, blockIO: null },
];

describe("Containers Page", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/containers") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(containers)));
      }

      if (url.includes("/api/containers/ctr-2/start") && method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ...containers[1], status: "running", state: "Up just now" })));
      }

      if (url.endsWith("/api/containers/run") && method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          id: "ctr-4",
          name: "new-container",
          image: "busybox:latest",
          status: "running",
          state: "Up just now",
          ports: "",
          created: new Date().toISOString(),
          cpuPercent: 0,
          memUsage: "0 B",
          memLimit: "512 MB",
          netIO: "0 B / 0 B",
          blockIO: "0 B / 0 B",
        }), { status: 201 }));
      }

      return Promise.reject(new Error(`Unhandled ${method} ${url}`));
    });
  });

  it("renders container list", async () => {
    renderWithProviders(<Containers />);
    expect(await screen.findByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.getByText("postgres-db")).toBeInTheDocument();
  });

  it("filters containers by name", async () => {
    renderWithProviders(<Containers />);
    const input = await screen.findByPlaceholderText("Filter containers...");
    fireEvent.change(input, { target: { value: "nginx" } });
    expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.queryByText("postgres-db")).not.toBeInTheDocument();
  });

  it("starts a stopped container", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("postgres-db");
    fireEvent.click(screen.getByTitle("Start"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/containers/ctr-2/start"), expect.objectContaining({ method: "POST" }));
    });
  });

  it("shows Run Container button", async () => {
    renderWithProviders(<Containers />);
    expect(await screen.findByText("Run Container")).toBeInTheDocument();
  });
});
