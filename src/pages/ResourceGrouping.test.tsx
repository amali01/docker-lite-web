import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import Volumes from "@/pages/Volumes";
import Networks from "@/pages/Networks";
import Images from "@/pages/Images";

/**
 * Guards the compose-grouping wiring for the three resource pages that had no
 * grouping coverage. Each fixture set has one compose project with >1 member
 * (must collapse into a single group row) plus one ungroupable member
 * (default network / <none> image) that must stay a flat row.
 */

const fetchMock = vi.fn();

function mockList(pathname: string, body: unknown) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(pathname)) {
      return Promise.resolve(new Response(JSON.stringify(body)));
    }
    return Promise.reject(new Error(`Unhandled URL ${url}`));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("Volumes compose grouping", () => {
  it("collapses same-project volumes into one group and keeps a solo volume flat", async () => {
    mockList("/api/volumes", [
      { name: "myapp-db", driver: "local", mountpoint: "/v/myapp-db", created: "2026-03-30", size: "1 GB", inUse: true },
      { name: "myapp-cache", driver: "local", mountpoint: "/v/myapp-cache", created: "2026-03-30", size: "1 GB", inUse: false },
      { name: "standalone", driver: "local", mountpoint: "/v/standalone", created: "2026-03-30", size: "1 GB", inUse: false },
    ]);

    renderWithProviders(<Volumes />);

    await waitFor(() => expect(screen.getByText("myapp")).toBeInTheDocument());
    // exactly one compose group formed; the solo volume did not become one
    expect(screen.getAllByText(/Compose Stack/)).toHaveLength(1);
    expect(screen.getByText("standalone")).toBeInTheDocument();
  });
});

describe("Networks compose grouping", () => {
  it("groups same-project networks but never groups a default network", async () => {
    mockList("/api/networks", [
      { id: "n1", name: "myapp-frontend", driver: "bridge", scope: "local", subnet: "", gateway: "", containers: 1 },
      { id: "n2", name: "myapp-backend", driver: "bridge", scope: "local", subnet: "", gateway: "", containers: 1 },
      { id: "n3", name: "bridge", driver: "bridge", scope: "local", subnet: "", gateway: "", containers: 3 },
    ]);

    renderWithProviders(<Networks />);

    await waitFor(() => expect(screen.getByText("myapp")).toBeInTheDocument());
    expect(screen.getAllByText(/Compose Stack/)).toHaveLength(1);
    // the default bridge network is rendered but tagged default (ungroupable)
    expect(screen.getAllByText("bridge").length).toBeGreaterThan(0);
    expect(screen.getAllByText("default").length).toBeGreaterThan(0);
  });
});

describe("Images compose grouping", () => {
  it("groups same-project images but never groups a <none> image", async () => {
    mockList("/api/images", [
      { id: "i1", repository: "myapp-web", tag: "latest", size: "40 MB", created: "2026-03-30" },
      { id: "i2", repository: "myapp-api", tag: "latest", size: "40 MB", created: "2026-03-30" },
      { id: "i3", repository: "<none>", tag: "<none>", size: "40 MB", created: "2026-03-30" },
    ]);

    renderWithProviders(<Images />);

    await waitFor(() => expect(screen.getByText("myapp")).toBeInTheDocument());
    expect(screen.getAllByText(/Compose Stack/)).toHaveLength(1);
    expect(screen.getAllByText(/<none>/).length).toBeGreaterThan(0);
  });
});
