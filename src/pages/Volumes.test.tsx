import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import Volumes from "@/pages/Volumes";
import { renderWithProviders } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const fetchMock = vi.fn();

const volumes = [
  { name: "postgres-data", driver: "local", mountpoint: "/var/lib/docker/volumes/postgres-data", created: "2026-03-30", size: "1 GB", inUse: false },
  { name: "cache-data", driver: "local", mountpoint: "/var/lib/docker/volumes/cache-data", created: "2026-03-30", size: "2 MB", inUse: false },
];

/** Volume names whose DELETE should come back as a server error. */
const failingVolumes = new Map<string, string>();

function removeButtonForRow(volumeName: string) {
  const row = screen.getByText(volumeName).closest("tr");
  expect(row).not.toBeNull();
  return within(row as HTMLTableRowElement).getByRole("button");
}

/** Every destructive action now goes through the shared confirmation. */
async function acceptConfirmation(confirmLabel: string) {
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: confirmLabel }));
}

describe("Volumes page", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    failingVolumes.clear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/volumes") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(volumes)));
      }

      if (method === "DELETE") {
        const name = url.split("/api/volumes/")[1];
        const failure = failingVolumes.get(decodeURIComponent(name ?? ""));

        if (failure) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: { message: failure, code: "docker_error" } }), { status: 409 }),
          );
        }

        return Promise.resolve(new Response(null, { status: 204 }));
      }

      return Promise.reject(new Error(`Unhandled ${method} ${url}`));
    });
  });

  it("does not delete a volume until the confirmation is accepted", async () => {
    renderWithProviders(<Volumes />);
    await screen.findByText("postgres-data");
    fireEvent.click(removeButtonForRow("postgres-data"));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("postgres-data")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete volume" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/volumes/postgres-data"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("surfaces the server's reason when a volume cannot be removed", async () => {
    failingVolumes.set("postgres-data", "volume is in use by container nginx-proxy");

    renderWithProviders(<Volumes />);
    await screen.findByText("postgres-data");
    fireEvent.click(removeButtonForRow("postgres-data"));
    await acceptConfirmation("Delete volume");

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("volume is in use by container nginx-proxy");
    });
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    renderWithProviders(<Volumes />);
    await screen.findByText("postgres-data");
    fireEvent.click(removeButtonForRow("postgres-data"));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));
  });

  it("warns that the volume data is destroyed", async () => {
    renderWithProviders(<Volumes />);
    await screen.findByText("postgres-data");
    fireEvent.click(removeButtonForRow("postgres-data"));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/data in this volume is destroyed/i)).toBeInTheDocument();
  });

  it("attempts every selected volume when one fails and reports the partial outcome", async () => {
    failingVolumes.set("postgres-data", "volume is in use by container nginx-proxy");

    renderWithProviders(<Volumes />);
    await screen.findByText("postgres-data");
    fireEvent.click(screen.getByLabelText("Select all"));
    fireEvent.click(screen.getByTitle("Delete selected"));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete 2 volumes?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete 2 volumes" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/volumes/cache-data"), expect.objectContaining({ method: "DELETE" }));
    });

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining("1 of 2 volumes"));
    });
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining("volume is in use by container nginx-proxy"));
  });
});
