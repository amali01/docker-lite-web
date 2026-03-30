import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import Containers from "@/pages/Containers";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();

const containers = [
  { id: "ctr-1", name: "nginx-proxy", image: "nginx:alpine", composeProject: null, composeService: null, status: "running", state: "Up 3 hours", ports: "80/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: "20 MB", memLimit: "512 MB", netIO: null, blockIO: null },
  { id: "ctr-2", name: "sportseventhub-postgres", image: "postgres:16", composeProject: null, composeService: null, status: "stopped", state: "Exited", ports: "5432/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: null, memLimit: null, netIO: null, blockIO: null },
  { id: "ctr-3", name: "sportseventhub-redis", image: "redis:7-alpine", composeProject: null, composeService: null, status: "running", state: "Up 1 hour", ports: "6379/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: "10 MB", memLimit: "256 MB", netIO: null, blockIO: null },
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

      if (url.includes("/api/containers/ctr-1/stop") && method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ...containers[0], status: "stopped", state: "Exited just now" })));
      }

      if (url.includes("/api/containers/ctr-3/stop") && method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ...containers[2], status: "stopped", state: "Exited just now" })));
      }

      if (url.includes("/api/containers/compose/sportseventhub/stop") && method === "POST") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      if (url.endsWith("/api/containers/run") && method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          id: "ctr-4",
          name: "new-container",
          image: "busybox:latest",
          composeProject: null,
          composeService: null,
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
    expect(screen.getByText("sportseventhub-postgres")).toBeInTheDocument();
  });

  it("groups compose containers under a stack row", async () => {
    renderWithProviders(<Containers />);
    expect(await screen.findByText("sportseventhub")).toBeInTheDocument();
    expect(screen.getByText("Compose Stack • 2 containers")).toBeInTheDocument();
  });

  it("filters containers by name", async () => {
    renderWithProviders(<Containers />);
    const input = await screen.findByPlaceholderText("Filter containers...");
    fireEvent.change(input, { target: { value: "nginx" } });
    expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.queryByText("sportseventhub-postgres")).not.toBeInTheDocument();
  });

  it("filters to running containers only", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("nginx-proxy");
    fireEvent.click(screen.getByRole("radio", { name: "Show running containers" }));
    expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.getByText("sportseventhub-redis")).toBeInTheDocument();
    expect(screen.queryByText("sportseventhub-postgres")).not.toBeInTheDocument();
  });

  it("selects all visible containers from the header checkbox", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("nginx-proxy");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all containers" }));
    expect(screen.getByRole("checkbox", { name: "Select container nginx-proxy" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("checkbox", { name: "Select container sportseventhub-postgres" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("checkbox", { name: "Select container sportseventhub-redis" })).toHaveAttribute("data-state", "checked");
  });

  it("shows bulk actions when multiple containers are selected", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("nginx-proxy");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select container nginx-proxy" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select container sportseventhub-redis" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByTitle("Delete selected containers")).toBeInTheDocument();
    expect(screen.getByTitle("Start selected containers")).toBeInTheDocument();
    expect(screen.getByTitle("Stop selected containers")).toBeInTheDocument();
    expect(screen.getByTitle("Restart selected containers")).toBeInTheDocument();
  });

  it("stops multiple selected containers", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("nginx-proxy");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select container nginx-proxy" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select container sportseventhub-redis" }));
    fireEvent.click(screen.getByTitle("Stop selected containers"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/containers/ctr-1/stop"), expect.objectContaining({ method: "POST" }));
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/containers/ctr-3/stop"), expect.objectContaining({ method: "POST" }));
    });
  });

  it("stops a compose stack from the group row", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("sportseventhub");

    fireEvent.click(screen.getByTitle("Stop stack"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/containers/compose/sportseventhub/stop"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("starts a stopped container", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("sportseventhub-postgres");
    fireEvent.click(screen.getByTitle("Start"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/containers/ctr-2/start"), expect.objectContaining({ method: "POST" }));
    });
  });

  it("shows Run Container button", async () => {
    renderWithProviders(<Containers />);
    expect(await screen.findByText("Run Container")).toBeInTheDocument();
  });

  it("adds hover titles for container name and image values", async () => {
    renderWithProviders(<Containers />);
    expect(await screen.findByTitle("nginx-proxy")).toBeInTheDocument();
    expect(screen.getByTitle("nginx:alpine")).toBeInTheDocument();
  });

  it("shows action buttons without hover", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("nginx-proxy");
    expect(screen.getAllByTitle("Restart").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Logs").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Remove").length).toBeGreaterThan(0);
  });
});
