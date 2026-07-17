import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AppSidebar } from "@/components/AppSidebar";
import { ShutdownProvider } from "@/components/ShutdownProvider";
import { resetAuthRuntimeState, setAuthRuntimeState } from "@/lib/api/client";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();

const engineInfoResponse = () =>
  new Response(
    JSON.stringify({
      connected: true,
      dockerVersion: "28.0.1",
      apiVersion: "1.48",
      os: "Linux",
      arch: "x86_64",
      kernelVersion: "6.11",
      totalMemory: "16 GB",
      cpus: 8,
      storageDriver: "overlay2",
      rootDir: "/var/lib/docker",
      serverTime: new Date().toISOString(),
      endpoint: "unix:///var/run/docker.sock",
    }),
  );

describe("AppSidebar", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    resetAuthRuntimeState();

    fetchMock.mockResolvedValue(engineInfoResponse());
  });

  it("renders the container logo mark", async () => {
    renderWithProviders(<AppSidebar />);

    const logoMark = await screen.findByLabelText("DockLite mark");
    const logo = logoMark.querySelector("img");
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute("src", "/container-logo.svg");
  });

  it("shuts the server down when Quit is confirmed", async () => {
    setAuthRuntimeState({ token: "jwt-token" });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/session")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              authenticated: true,
              username: "admin",
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              defaultCredentialsActive: true,
              message: null,
            }),
          ),
        );
      }
      if (url.endsWith("/api/shutdown")) {
        return Promise.resolve(new Response(JSON.stringify({ stopping: true }), { status: 202 }));
      }
      return Promise.resolve(engineInfoResponse());
    });

    renderWithProviders(
      <ShutdownProvider>
        <AppSidebar />
      </ShutdownProvider>,
    );

    const quitTrigger = await screen.findByRole("button", { name: "Quit DockLite" });
    fireEvent.click(quitTrigger);

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Quit DockLite" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/shutdown"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("DockLite has shut down")).toBeInTheDocument();
  });

  it("does not claim shutdown when the server rejects it (expired session)", async () => {
    setAuthRuntimeState({ token: "jwt-token" });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/session")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              authenticated: true,
              username: "admin",
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              defaultCredentialsActive: true,
              message: null,
            }),
          ),
        );
      }
      if (url.endsWith("/api/shutdown")) {
        return Promise.resolve(new Response("Unauthorized", { status: 401 }));
      }
      return Promise.resolve(engineInfoResponse());
    });

    renderWithProviders(
      <ShutdownProvider>
        <AppSidebar />
      </ShutdownProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Quit DockLite" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Quit DockLite" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/shutdown"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    // The server answered (401) so it's still running — the terminal screen must
    // not be shown claiming otherwise.
    await waitFor(() => {
      expect(screen.queryByText("DockLite has shut down")).not.toBeInTheDocument();
    });
  });
});
