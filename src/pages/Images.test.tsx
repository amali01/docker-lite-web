import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import Images from "@/pages/Images";
import { renderWithProviders } from "@/test/render";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const fetchMock = vi.fn();

const images = [
  { id: "sha256:aaa", repository: "nginx", tag: "alpine", size: "40 MB", created: "2026-03-30" },
  { id: "sha256:bbb", repository: "postgres", tag: "16", size: "400 MB", created: "2026-03-30" },
];

function removeButtonForRow(repository: string) {
  const row = screen.getByTitle(`${repository}:${images.find((image) => image.repository === repository)?.tag}`).closest("tr");
  expect(row).not.toBeNull();
  return within(row as HTMLTableRowElement).getAllByRole("button")[1];
}

describe("Images page", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/images") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(images)));
      }

      if (method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      return Promise.reject(new Error(`Unhandled ${method} ${url}`));
    });
  });

  it("does not remove an image until the confirmation is accepted", async () => {
    renderWithProviders(<Images />);
    await screen.findByTitle("nginx:alpine");
    fireEvent.click(removeButtonForRow("nginx"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Remove image?");
    expect(within(dialog).getByText("nginx:alpine")).toBeInTheDocument();
    expect(within(dialog).getByText(/removal is forced/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove image" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/images/sha256"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("removes nothing when the confirmation is cancelled", async () => {
    renderWithProviders(<Images />);
    await screen.findByTitle("nginx:alpine");
    fireEvent.click(removeButtonForRow("nginx"));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));
  });

  it("states the count before a bulk removal", async () => {
    renderWithProviders(<Images />);
    await screen.findByTitle("nginx:alpine");
    fireEvent.click(screen.getByLabelText("Select all"));
    fireEvent.click(screen.getByTitle("Delete selected"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Remove 2 images?");
    expect(within(dialog).getByText("postgres:16")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove 2 images" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/images/sha256%3Aaaa"),
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/images/sha256%3Abbb"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
