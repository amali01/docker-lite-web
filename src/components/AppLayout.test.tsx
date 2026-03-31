import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();

describe("AppLayout", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValue(
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
      ),
    );
  });

  it("opens a mobile navigation drawer", async () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>Dashboard content</div>} />
        </Route>
      </Routes>,
    );

    const menuButton = await screen.findByRole("button", { name: "Open navigation menu" });
    fireEvent.click(menuButton);

    const dialog = await screen.findByRole("dialog", { name: "Navigation menu" });
    expect(within(dialog).getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });
});
