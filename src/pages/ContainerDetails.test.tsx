import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ContainerDetails from "./ContainerDetails";

const useContainerDetailsMock = vi.fn();
const useContainerInspectMock = vi.fn();
const useContainerStatsMock = vi.fn();

const routerFutureFlags = {
  v7_relativeSplatPath: true,
  v7_startTransition: true,
} as const;

vi.mock("@/hooks/use-containers", () => ({
  useContainerDetails: (...args: unknown[]) => useContainerDetailsMock(...args),
  useContainerInspect: (...args: unknown[]) => useContainerInspectMock(...args),
  useContainerStats: (...args: unknown[]) => useContainerStatsMock(...args),
}));

describe("ContainerDetails route", () => {
  useContainerDetailsMock.mockName("useContainerDetails");
  useContainerInspectMock.mockName("useContainerInspect");
  useContainerStatsMock.mockName("useContainerStats");

  it("renders the container details page for a direct route and passes the route param to the hooks", () => {
    useContainerDetailsMock.mockReset();
    useContainerInspectMock.mockReset();
    useContainerStatsMock.mockReset();

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

    render(
      <MemoryRouter future={routerFutureFlags} initialEntries={["/containers/container-123"]}>
        <Routes>
          <Route path="/containers/:containerId" element={<ContainerDetails />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Loading container details")).toBeInTheDocument();
    expect(useContainerDetailsMock).toHaveBeenCalledWith("container-123");
    expect(useContainerInspectMock).toHaveBeenCalledWith("container-123");
    expect(useContainerStatsMock).toHaveBeenCalledWith("container-123");
  });
});
