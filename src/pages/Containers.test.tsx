import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import Containers from "@/pages/Containers";
import { renderWithProviders } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const fetchMock = vi.fn();

/** Container ids whose next mutation should come back as a server error. */
const failingContainerIds = new Set<string>();

const engineInfo = {
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
};

function errorResponse(message: string) {
  return new Response(JSON.stringify({ error: { message, code: "docker_error" } }), { status: 500 });
}

const containers = [
  { id: "ctr-1", name: "nginx-proxy", image: "nginx:alpine", composeProject: null, composeService: null, status: "running", state: "Up 3 hours", ports: "80/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: "20 MB", memLimit: "512 MB", netIO: null, blockIO: null },
  { id: "ctr-2", name: "sports-postgres", image: "postgres:16", composeProject: "sportseventhub", composeService: "postgres", status: "stopped", state: "Exited", ports: "5432/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: null, memLimit: null, netIO: null, blockIO: null },
  { id: "ctr-3", name: "sportseventhub-redis", image: "redis:7-alpine", composeProject: "sportseventhub", composeService: "redis", status: "running", state: "Up 1 hour", ports: "6379/tcp", created: new Date().toISOString(), cpuPercent: null, memUsage: "10 MB", memLimit: "256 MB", netIO: null, blockIO: null },
];

function renderContainersRoute() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/containers"]}>
        <Routes>
          <Route path="/containers" element={<Containers />} />
          <Route path="/containers/:containerId" element={<div>Container detail route reached</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Containers Page", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.info).mockClear();
    failingContainerIds.clear();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      const failing = [...failingContainerIds].find((id) => url.includes(`/api/containers/${id}/`));
      if (failing && method === "POST") {
        return Promise.resolve(errorResponse(`container ${failing} is unresponsive`));
      }

      if (url.endsWith("/api/engine") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(engineInfo)));
      }

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
    expect(screen.getByText("sports-postgres")).toBeInTheDocument();
  });

  it("groups compose containers under a stack row", async () => {
    renderWithProviders(<Containers />);
    expect(await screen.findByText("sportseventhub")).toBeInTheDocument();
    expect(screen.getByText("2 containers")).toBeInTheDocument();
  });

  it("filters containers by name", async () => {
    renderWithProviders(<Containers />);
    const input = await screen.findByPlaceholderText("Filter containers...");
    fireEvent.change(input, { target: { value: "nginx" } });
    expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.queryByText("sports-postgres")).not.toBeInTheDocument();
  });

  it("filters to running containers only", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("nginx-proxy");
    fireEvent.click(screen.getByRole("radio", { name: "Show running containers" }));
    expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.getByText("sportseventhub-redis")).toBeInTheDocument();
    expect(screen.queryByText("sports-postgres")).not.toBeInTheDocument();
  });

  it("selects all visible containers from the header checkbox", async () => {
    renderWithProviders(<Containers />);
    await screen.findByText("nginx-proxy");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all containers" }));
    expect(screen.getByRole("checkbox", { name: "Select container nginx-proxy" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("checkbox", { name: "Select container sports-postgres" })).toHaveAttribute("data-state", "checked");
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

  it("attempts every selected container when one bulk item fails and reports the partial outcome", async () => {
    failingContainerIds.add("ctr-1");

    renderWithProviders(<Containers />);
    await screen.findByText("nginx-proxy");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select container nginx-proxy" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select container sportseventhub-redis" }));
    fireEvent.click(screen.getByTitle("Stop selected containers"));

    // The failure on ctr-1 must not abandon ctr-3.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/containers/ctr-3/stop"), expect.objectContaining({ method: "POST" }));
    });

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining("1 of 2 containers"));
    });
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining("1 failed"));
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining("container ctr-1 is unresponsive"));
    expect(vi.mocked(toast.success)).not.toHaveBeenCalledWith(expect.stringContaining("Stopped 2 containers"));
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
    await screen.findByText("sports-postgres");
    fireEvent.click(screen.getByTitle("Start"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/containers/ctr-2/start"), expect.objectContaining({ method: "POST" }));
    });
  });

  it("shows Run Container button", async () => {
    renderWithProviders(<Containers />);
    expect(await screen.findByText("Run Container")).toBeInTheDocument();
  });

  it("renders without known test-environment warnings", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      renderWithProviders(<Containers />);
      await screen.findByText("nginx-proxy");

      const messages = [...errorSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map((value) => value instanceof Error ? value.message : String(value))
        .join("\n");

      expect(messages).not.toContain("HTMLCanvasElement.prototype.getContext");
      expect(messages).not.toContain("React Router Future Flag Warning");
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
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

  it("navigates to the detail route from the containers page", async () => {
    renderContainersRoute();

    await screen.findByText("nginx-proxy");
    fireEvent.click(screen.getByRole("link", { name: "View details for nginx-proxy" }));

    expect(await screen.findByText("Container detail route reached")).toBeInTheDocument();
  });

  it("navigates to the detail route when the container name is clicked", async () => {
    renderContainersRoute();

    fireEvent.click(await screen.findByRole("link", { name: "nginx-proxy" }));

    expect(await screen.findByText("Container detail route reached")).toBeInTheDocument();
  });
});
