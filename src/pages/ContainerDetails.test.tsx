import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import ContainerDetails from "./ContainerDetails";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const useContainerDetailsMock = vi.fn();
const useContainerInspectMock = vi.fn();
const useContainerStatsMock = vi.fn();
const useEngineInfoMock = vi.fn();

/** Every container mutation the Quick Actions row can reach, stubbed so each click is observable. */
const removeContainerMock = vi.fn();
const rebuildContainerMock = vi.fn();
const startContainerMock = vi.fn();
const stopContainerMock = vi.fn();
const restartContainerMock = vi.fn();

vi.mock("@/hooks/use-containers", () => ({
  useContainerDetails: (...args: unknown[]) => useContainerDetailsMock(...args),
  useContainerInspect: (...args: unknown[]) => useContainerInspectMock(...args),
  useContainerStats: (...args: unknown[]) => useContainerStatsMock(...args),
  // The Stats tab accumulates its own polled history; the page-level fixtures cover the rest.
  useContainerStatsHistory: () => [],
  STATS_POLL_INTERVAL_MS: 5000,
  useRemoveContainer: () => ({ mutateAsync: removeContainerMock, isPending: false }),
  useRebuildContainer: () => ({ mutateAsync: rebuildContainerMock, isPending: false }),
  useStartContainer: () => ({ mutateAsync: startContainerMock, isPending: false }),
  useStopContainer: () => ({ mutateAsync: stopContainerMock, isPending: false }),
  useRestartContainer: () => ({ mutateAsync: restartContainerMock, isPending: false }),
}));

vi.mock("@/hooks/use-engine", () => ({
  useEngineInfo: (...args: unknown[]) => useEngineInfoMock(...args),
}));

vi.mock("@/components/ContainerLogs", () => ({
  ContainerLogs: ({ containerName }: { containerName: string }) => <div>Embedded logs for {containerName}</div>,
}));

vi.mock("@/components/ContainerExec", () => ({
  ContainerExec: ({ containerName }: { containerName: string }) => <div>Embedded terminal for {containerName}</div>,
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
  stats: [
    {
      sampledAt: "2026-03-31T09:59:00Z",
      cpuPercent: 0.12,
      memoryUsageBytes: 25784320,
      memoryLimitBytes: 536870912,
    },
    {
      sampledAt: "2026-03-31T10:00:00Z",
      cpuPercent: 0.2,
      memoryUsageBytes: 26738688,
      memoryLimitBytes: 536870912,
    },
  ],
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
    removeContainerMock.mockReset();
    rebuildContainerMock.mockReset();
    startContainerMock.mockReset();
    stopContainerMock.mockReset();
    restartContainerMock.mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.info).mockClear();

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
      <MemoryRouter initialEntries={["/containers/container-123"]}>
        <Routes>
          <Route path="/containers" element={<div>Containers list route reached</div>} />
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

  it("renders logs, terminal, inspect, and stats tab content", () => {
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

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Logs" }));
    expect(screen.getByText("Embedded logs for nginx-proxy")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Terminal" }));
    expect(screen.getByText("Embedded terminal for nginx-proxy")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Inspect" }));
    expect(screen.getByText("Inspect JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Stats" }));
    expect(screen.getByText("Latest sample")).toBeInTheDocument();
    expect(screen.getByText("Sample history")).toBeInTheDocument();
  });

  function renderLoadedDetails() {
    // The detail queries are keyed per container and the container mutations do
    // not invalidate them, so the page refetches them itself after an action.
    const detailsRefetch = vi.fn();
    const inspectRefetch = vi.fn();
    const loaded = (data: unknown, refetch: () => void) => ({
      isLoading: false,
      isPending: false,
      isError: false,
      data,
      error: null,
      refetch,
    });

    useContainerDetailsMock.mockReturnValue(loaded(containerDetails, detailsRefetch));
    useContainerInspectMock.mockReturnValue(loaded(containerDetails.inspect, inspectRefetch));
    useContainerStatsMock.mockReturnValue(loaded(containerDetails.stats, vi.fn()));

    renderDetailsRoute();

    return { detailsRefetch, inspectRefetch };
  }

  it("does not remove the container until the confirmation is accepted", async () => {
    renderLoadedDetails();

    fireEvent.click(screen.getByRole("button", { name: "Remove container nginx-proxy" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Delete container?");
    expect(within(dialog).getByText("nginx-proxy")).toBeInTheDocument();
    expect(removeContainerMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete container" }));

    await waitFor(() => {
      expect(removeContainerMock).toHaveBeenCalledExactlyOnceWith("container-123");
    });
  });

  it("returns to the containers list after a confirmed remove instead of sitting on a dead route", async () => {
    renderLoadedDetails();

    fireEvent.click(screen.getByRole("button", { name: "Remove container nginx-proxy" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete container" }));

    expect(await screen.findByText("Containers list route reached")).toBeInTheDocument();
    expect(screen.queryByText("Container not found")).not.toBeInTheDocument();
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Removed nginx-proxy");
  });

  it("removes nothing and stays put when the confirmation is cancelled", async () => {
    renderLoadedDetails();

    fireEvent.click(screen.getByRole("button", { name: "Remove container nginx-proxy" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(removeContainerMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Containers list route reached")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove container nginx-proxy" })).toBeInTheDocument();
  });

  it("confirms a rebuild, which destroys and recreates the container", async () => {
    renderLoadedDetails();

    fireEvent.click(screen.getByRole("button", { name: "Refresh container nginx-proxy" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Rebuild container?");
    expect(rebuildContainerMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Rebuild container" }));

    await waitFor(() => {
      expect(rebuildContainerMock).toHaveBeenCalledExactlyOnceWith("container-123");
    });
    // A rebuilt container still exists, so the page stays on it.
    expect(screen.queryByText("Containers list route reached")).not.toBeInTheDocument();
  });

  it("runs the reversible actions straight away, with no confirmation", async () => {
    renderLoadedDetails();

    fireEvent.click(screen.getByRole("button", { name: "Stop container nginx-proxy" }));

    await waitFor(() => {
      expect(stopContainerMock).toHaveBeenCalledExactlyOnceWith("container-123");
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Stopped nginx-proxy");
    // Refreshing the header afterwards is the mutation's job, not this page's -
    // see the invalidation contract in use-containers.test.tsx.
  });

  it("restarts from Quick Actions without a confirmation", async () => {
    renderLoadedDetails();

    fireEvent.click(screen.getByRole("button", { name: "Restart container nginx-proxy" }));

    await waitFor(() => {
      expect(restartContainerMock).toHaveBeenCalledExactlyOnceWith("container-123");
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("sends the Logs and Terminal Quick Actions to the matching tab", () => {
    renderLoadedDetails();

    fireEvent.click(screen.getByRole("button", { name: "View logs for nginx-proxy" }));
    expect(screen.getByText("Embedded logs for nginx-proxy")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Open terminal for nginx-proxy" }));
    expect(screen.getByText("Embedded terminal for nginx-proxy")).toBeInTheDocument();
  });

  it("drops the self-referential Details link from the Quick Actions row", () => {
    renderLoadedDetails();

    expect(screen.queryByRole("link", { name: "View details for nginx-proxy" })).not.toBeInTheDocument();
  });

  it("dead-ends on a not-found state rather than a stale view when the container is gone", () => {
    const loaded = (data: unknown) => ({ isLoading: false, isPending: false, isError: false, data, error: null });

    useContainerDetailsMock.mockReturnValue(loaded(undefined));
    useContainerInspectMock.mockReturnValue(loaded(undefined));
    useContainerStatsMock.mockReturnValue(loaded(undefined));

    renderDetailsRoute();

    expect(screen.getByText("Container not found")).toBeInTheDocument();
    expect(screen.queryByText("nginx-proxy")).not.toBeInTheDocument();
  });
});
