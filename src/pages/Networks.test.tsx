import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import Networks from "@/pages/Networks";
import { renderWithProviders } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const fetchMock = vi.fn();

const networks = [
  { id: "net-1", name: "bridge", driver: "bridge", scope: "local", subnet: "172.17.0.0/16", gateway: "172.17.0.1", containers: 2 },
  { id: "net-2", name: "app-network", driver: "bridge", scope: "local", subnet: "172.20.0.0/16", gateway: "172.20.0.1", containers: 1 },
];

function removeButtonForRow(name: string) {
  const row = screen.getByText(name).closest("tr");
  expect(row).not.toBeNull();
  return within(row as HTMLTableRowElement).getByRole("button");
}

describe("Networks page", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/networks") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(networks)));
      }

      if (method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      return Promise.reject(new Error(`Unhandled ${method} ${url}`));
    });
  });

  it("does not delete a network until the confirmation is accepted", async () => {
    renderWithProviders(<Networks />);
    await screen.findByText("app-network");
    fireEvent.click(removeButtonForRow("app-network"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Delete network?");
    expect(within(dialog).getByText("app-network")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete network" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/networks/net-2"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    renderWithProviders(<Networks />);
    await screen.findByText("app-network");
    fireEvent.click(removeButtonForRow("app-network"));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));
  });

  it("counts only the networks a bulk delete can actually remove", async () => {
    renderWithProviders(<Networks />);
    await screen.findByText("app-network");
    // "Select all" ticks the built-in bridge network too; it cannot be removed,
    // so the confirmation must not promise to delete it.
    fireEvent.click(screen.getByLabelText("Select all"));
    fireEvent.click(screen.getByTitle("Delete selected"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Delete network?");
    expect(within(dialog).getByText("app-network")).toBeInTheDocument();
    expect(within(dialog).queryByText("bridge")).not.toBeInTheDocument();
  });
});
