import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContainerStatsTab } from "./ContainerStatsTab";
import { renderWithProviders } from "@/test/render";
import { useContainerStats } from "@/hooks/use-containers";
import type { ContainerStatsSample, ContainerSummary } from "@/lib/api/types";

const getContainerStatsMock = vi.fn();

vi.mock("@/lib/api/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/resources")>()),
  getContainerStats: (...args: unknown[]) => getContainerStatsMock(...args),
}));

vi.mock("@/hooks/use-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-engine")>()),
  useEngineInfo: () => ({ data: { selectedEngineId: "engine-1" }, isLoading: false, isPending: false, error: null }),
}));

const summary: ContainerSummary = {
  id: "container-a",
  name: "nginx-proxy",
  image: "nginx:alpine",
  composeProject: null,
  composeService: null,
  status: "running",
  state: "Up 3 hours",
  ports: "80/tcp",
  created: "2026-03-31T08:00:00Z",
  cpuPercent: 0.12,
  memUsage: "24.5 MiB",
  memPercent: 4.79,
  netIO: "1.2 MB / 840 KB",
  memLimit: "512 MiB",
  blockIO: "12 MB / 4 KB",
};

function sample(index: number): ContainerStatsSample {
  return {
    sampledAt: `2026-03-31T10:${String(index).padStart(2, "0")}:00Z`,
    cpuPercent: index + 1,
    memoryUsageBytes: 25784320 + index,
    memoryLimitBytes: 536870912,
  };
}

function bars() {
  return screen.queryAllByTestId("stats-cpu-bar");
}

/** Drive the polling clock deterministically: React Testing Library's waitFor
 * deadlocks against Vitest fake timers, so advance them by hand instead. */
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  // React Query notifies observers from a setTimeout(0), so let the clock past it.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

describe("ContainerStatsTab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    let index = 0;
    getContainerStatsMock.mockReset();
    getContainerStatsMock.mockImplementation(() => {
      const next = [sample(index)];
      index += 1;
      return Promise.resolve(next);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accumulates samples across polls and renders the history chart", async () => {
    renderWithProviders(<ContainerStatsTab summary={summary} stats={[]} />);

    await tick();
    expect(getContainerStatsMock).toHaveBeenCalledTimes(1);
    expect(bars()).toHaveLength(0);
    expect(screen.getByText(/Collecting history/i)).toBeInTheDocument();

    await tick(5000);
    expect(bars()).toHaveLength(2);

    await tick(5000);
    expect(bars()).toHaveLength(3);
  });

  it("caps the retained history", async () => {
    renderWithProviders(<ContainerStatsTab summary={summary} stats={[]} />);

    await tick();

    for (let poll = 0; poll < 30; poll += 1) {
      await tick(5000);
    }

    expect(getContainerStatsMock).toHaveBeenCalledTimes(31);
    expect(bars()).toHaveLength(24);
  });

  it("drops the previous container's history when the container changes", async () => {
    const { rerender } = renderWithProviders(<ContainerStatsTab summary={summary} stats={[]} />);

    await tick();
    await tick(5000);
    expect(bars()).toHaveLength(2);

    rerender(<ContainerStatsTab summary={{ ...summary, id: "container-b" }} stats={[]} />);
    await tick();

    expect(bars()).toHaveLength(0);
    expect(screen.getByText(/Collecting history/i)).toBeInTheDocument();
  });

  it("stops polling once the tab is unmounted", async () => {
    const { unmount } = renderWithProviders(<ContainerStatsTab summary={summary} stats={[]} />);

    await tick();
    await tick(5000);
    expect(getContainerStatsMock).toHaveBeenCalledTimes(2);

    unmount();
    await tick(30000);

    expect(getContainerStatsMock).toHaveBeenCalledTimes(2);
  });

  it("stops polling when the tab unmounts under the page's own stats observer", async () => {
    // The details page keeps an un-polled observer on the same query key; leaving
    // the Stats tab has to take the interval with it anyway.
    function PageHarness({ statsTabOpen }: { statsTabOpen: boolean }) {
      useContainerStats(summary.id);
      return statsTabOpen ? <ContainerStatsTab summary={summary} stats={[]} /> : null;
    }

    const { rerender } = renderWithProviders(<PageHarness statsTabOpen />);

    await tick();
    await tick(5000);
    expect(getContainerStatsMock).toHaveBeenCalledTimes(2);

    rerender(<PageHarness statsTabOpen={false} />);
    await tick(30000);

    expect(getContainerStatsMock).toHaveBeenCalledTimes(2);
  });
});
