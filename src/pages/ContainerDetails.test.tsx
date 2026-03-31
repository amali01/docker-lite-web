import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ContainerDetails from "./ContainerDetails";

const useContainerDetailsMock = vi.fn();
const useContainerInspectMock = vi.fn();
const useContainerStatsMock = vi.fn();
const useEngineInfoMock = vi.fn();

const routerFutureFlags = {
  v7_relativeSplatPath: true,
  v7_startTransition: true,
} as const;

vi.mock("@/hooks/use-containers", () => ({
  useContainerDetails: (...args: unknown[]) => useContainerDetailsMock(...args),
  useContainerInspect: (...args: unknown[]) => useContainerInspectMock(...args),
  useContainerStats: (...args: unknown[]) => useContainerStatsMock(...args),
}));

vi.mock("@/hooks/use-engine", () => ({
  useEngineInfo: (...args: unknown[]) => useEngineInfoMock(...args),
}));

const containerDetails = {
  summary: {
    id: "container-123",
    name: "nginx-proxy",
    image: "nginx:alpine",
    composeProject: "edge-gateway",
    composeService: "proxy",
    status: "running" as const,
    state: "Up 3 hours",
    ports: "0.0.0.0:80->80/tcp, 443/tcp",
    created: "2026-03-31T08:00:00Z",
    cpuPercent: 0.12,
    memUsage: "24.5 MiB",
    memPercent: 4.79,
    netIO: "1.2 MB / 840 KB",
    memLimit: "512 MiB",
    blockIO: "12 MB / 4 KB",
  },
  mounts: [
    { source: "/srv/nginx/conf", destination: "/etc/nginx/conf.d", type: "bind", readOnly: false, propagation: "rprivate" },
    { source: "nginx-cache", destination: "/var/cache/nginx", type: "volume", readOnly: false, propagation: null },
  ],
  ports: [
    { ip: "0.0.0.0", privatePort: 80, publicPort: 80, protocol: "tcp" as const },
    { ip: null, privatePort: 443, publicPort: null, protocol: "tcp" as const },
  ],
  labels: [
    { key: "com.docker.compose.project", value: "edge-gateway" },
    { key: "com.docker.compose.service", value: "proxy" },
    { key: "maintainer", value: "docklite" },
  ],
  inspect: {
    raw: {
      Id: "container-123",
      Config: {
        Image: "nginx:alpine",
      },
    },
  },
  stats: [],
};

describe("ContainerDetails route", () => {
  useContainerDetailsMock.mockName("useContainerDetails");
  useContainerInspectMock.mockName("useContainerInspect");
  useContainerStatsMock.mockName("useContainerStats");
  useEngineInfoMock.mockName("useEngineInfo");

  beforeEach(() => {
    useContainerDetailsMock.mockReset();
    useContainerInspectMock.mockReset();
    useContainerStatsMock.mockReset();
    useEngineInfoMock.mockReset();

    useEngineInfoMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: false,
      data: { endpoint: "unix:///var/run/docker.sock" },
      error: null,
    });
  });

  function renderDetailsRoute() {
    render(
      <MemoryRouter future={routerFutureFlags} initialEntries={["/containers/container-123"]}>
        <Routes>
          <Route path="/containers/:containerId" element={<ContainerDetails />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("renders a loading state while the detail data is being fetched", () => {
    useContainerDetailsMock.mockReturnValue({
      isLoading: true,
      isPending: false,
      isError: false,
      data: undefined,
      error: null,
    });
    useContainerInspectMock.mockReturnValue({
      isLoading: true,
      isPending: false,
      isError: false,
      data: undefined,
      error: null,
    });
    useContainerStatsMock.mockReturnValue({
      isLoading: true,
      isPending: false,
      isError: false,
      data: undefined,
      error: null,
    });

    renderDetailsRoute();

    expect(screen.getByText("Loading container details")).toBeInTheDocument();
    expect(useContainerDetailsMock).toHaveBeenCalledWith("container-123");
    expect(useContainerInspectMock).toHaveBeenCalledWith("container-123");
    expect(useContainerStatsMock).toHaveBeenCalledWith("container-123");
  });

  it("renders an error state when any detail query fails", () => {
    useContainerDetailsMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: true,
      data: undefined,
      error: new Error("boom"),
    });
    useContainerInspectMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: false,
      data: undefined,
      error: null,
    });
    useContainerStatsMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: false,
      data: undefined,
      error: null,
    });

    renderDetailsRoute();

    expect(screen.getByText("Unable to load container details")).toBeInTheDocument();
  });

  it("renders the details shell with header chrome and overview content", () => {
    useContainerDetailsMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: false,
      data: containerDetails,
      error: null,
    });
    useContainerInspectMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: false,
      data: containerDetails.inspect,
      error: null,
    });
    useContainerStatsMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: false,
      data: containerDetails.stats,
      error: null,
    });

    renderDetailsRoute();

    expect(screen.getByRole("link", { name: "Back to containers" })).toHaveAttribute("href", "/containers");
    expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.getByText("0.0.0.0:80->80/tcp, 443/tcp")).toBeInTheDocument();
    expect(screen.getByText("unix:///var/run/docker.sock")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Logs" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Terminal" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Inspect" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Stats" })).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("Compose")).toBeInTheDocument();
    expect(screen.getByText("Mounts")).toBeInTheDocument();
    expect(screen.getByText("Labels")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop container nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View logs for nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open terminal for nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("edge-gateway / proxy")).toBeInTheDocument();
  });
});
