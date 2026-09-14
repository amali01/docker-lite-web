import { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  containerDetailsQueryKey,
  containerInspectQueryKey,
  containersQueryKey,
  useStopContainer,
} from "@/hooks/use-containers";
import { engineQueryKey } from "@/hooks/use-engine";

const stopContainerMock = vi.fn();

// Partial mock: use-containers binds every container action at module scope, so
// a bare mock would break the import before a single test ran.
vi.mock("@/lib/api/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/resources")>()),
  stopContainer: (...args: unknown[]) => stopContainerMock(...args),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("container mutations", () => {
  // A container action changes the container's own state, not just the list.
  // Without the detail keys, stopping a container from the table left the
  // detail page reporting "Running" from cache when it was next opened.
  it("invalidates the per-container detail queries, not only the list", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    stopContainerMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStopContainer(), { wrapper: createWrapper(queryClient) });
    result.current.mutate("container-123");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const invalidatedKeys = invalidate.mock.calls.map(([options]) => options?.queryKey);

    expect(invalidatedKeys).toContainEqual(containersQueryKey);
    expect(invalidatedKeys).toContainEqual(engineQueryKey);
    expect(invalidatedKeys).toContainEqual(containerDetailsQueryKey);
    expect(invalidatedKeys).toContainEqual(containerInspectQueryKey);
  });
});
