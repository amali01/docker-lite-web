import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AppSidebar } from "@/components/AppSidebar";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();

describe("AppSidebar", () => {
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

  it("renders the container logo mark", async () => {
    renderWithProviders(<AppSidebar />);

    const logoMark = await screen.findByLabelText("DockLite mark");
    const logo = logoMark.querySelector("img");
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute("src", "/container-logo.svg");
  });
});
