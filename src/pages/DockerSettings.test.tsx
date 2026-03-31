import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import DockerSettings from "@/pages/DockerSettings";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();
const testTargetPayload = {
  kind: "ssh",
  label: "Prod Server",
  host: "prod.example.internal",
  port: 22,
  username: "ops",
  authMode: "agent",
} as const;

const createTargetResponse = {
  id: "prod-ssh",
  label: "Prod Server",
  endpoint: "ssh://ops@prod.example.internal",
  active: false,
  available: true,
  kind: "ssh",
  source: "saved",
  lastHealth: {
    status: "healthy",
    message: "Connected",
    checkedAt: "2026-03-31T12:00:00.000Z",
  },
} as const;

const engineTargetsFixture = [
  {
    id: "system",
    label: "System Docker",
    endpoint: "unix:///var/run/docker.sock",
    active: true,
    available: true,
    kind: "local",
    source: "builtin",
    lastHealth: {
      status: "healthy",
      message: "Connected to the local Docker socket",
      checkedAt: "2026-03-31T12:00:00.000Z",
    },
  },
  {
    id: "prod-ssh",
    label: "Prod Server",
    endpoint: "ssh://ops@prod.example.internal",
    active: false,
    available: true,
    kind: "ssh",
    source: "saved",
    lastHealth: {
      status: "healthy",
      message: "Connected",
      checkedAt: "2026-03-31T12:00:00.000Z",
    },
  },
  {
    id: "desktop-linux",
    label: "Docker Desktop",
    endpoint: "unix:///home/amali/.docker/desktop/docker.sock",
    active: false,
    available: true,
    kind: "local",
    source: "builtin",
    lastHealth: {
      status: "healthy",
      message: "Connected to Docker Desktop",
      checkedAt: "2026-03-31T12:01:00.000Z",
    },
  },
  {
    id: "staging-tls",
    label: "Staging TLS",
    endpoint: "tcp://staging.example.internal:2376",
    active: false,
    available: false,
    kind: "tcpTls",
    source: "saved",
    lastHealth: {
      status: "degraded",
      message: "TLS certificate expires soon",
      checkedAt: "2026-03-31T12:05:00.000Z",
    },
  },
] as const;

describe("DockerSettings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/engine") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({
            connected: true,
            dockerVersion: "26.1.0",
            apiVersion: "1.45",
            os: "Linux",
            arch: "x86_64",
            kernelVersion: "6.8.0",
            totalMemory: "32 GB",
            cpus: 12,
            storageDriver: "overlay2",
            rootDir: "/var/lib/docker",
            serverTime: new Date().toISOString(),
            endpoint: "unix:///var/run/docker.sock",
            selectedEngineId: "system",
          })),
        );
      }

      if (url.endsWith("/api/engine/targets") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify(engineTargetsFixture)),
        );
      }

      if (url.endsWith("/api/engine/select") && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({
            connected: true,
            dockerVersion: "26.1.0",
            apiVersion: "1.45",
            os: "Linux",
            arch: "x86_64",
            kernelVersion: "6.8.0",
            totalMemory: "32 GB",
            cpus: 12,
            storageDriver: "overlay2",
            rootDir: "/var/lib/docker",
            serverTime: new Date().toISOString(),
            endpoint: "unix:///home/amali/.docker/desktop/docker.sock",
            selectedEngineId: "desktop-linux",
          })),
        );
      }

      if (url.endsWith("/api/engine/targets") && method === "POST") {
        expect(JSON.parse(String(init?.body))).toEqual(testTargetPayload);
        return Promise.resolve(
          new Response(JSON.stringify(createTargetResponse)),
        );
      }

      if (url.endsWith("/api/engine/targets/test") && method === "POST") {
        expect(JSON.parse(String(init?.body))).toEqual(testTargetPayload);
        return Promise.resolve(
          new Response(JSON.stringify({
            status: "healthy",
            message: "Connection succeeded",
            checkedAt: "2026-03-31T12:00:00.000Z",
          })),
        );
      }

      return Promise.reject(new Error(`Unhandled ${method} ${url}`));
    });
  });

  it("shows available docker engines and lets the user switch", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByText("System Docker")).toBeInTheDocument();
    expect(screen.getByText("Docker Desktop")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Docker Desktop" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/engine/select"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("associates settings fields with accessible labels", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByLabelText("Backend Base URL")).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: "System Docker" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Docker Desktop" })).toBeInTheDocument();
    expect(screen.getByLabelText("Docker Endpoint")).toBeInTheDocument();
    expect(screen.getByLabelText("API Version")).toBeInTheDocument();
  });

  it("renders mixed local and remote engine target metadata", async () => {
    renderWithProviders(<DockerSettings />);

    const systemTarget = await screen.findByRole("radio", { name: "System Docker" });
    const prodTarget = screen.getByRole("radio", { name: "Prod Server" });
    const desktopTarget = screen.getByRole("radio", { name: "Docker Desktop" });
    const stagingTarget = screen.getByRole("radio", { name: "Staging TLS" });

    expect(systemTarget).toHaveAttribute("aria-checked", "true");
    expect(prodTarget).toHaveAttribute("aria-checked", "false");
    expect(desktopTarget).toHaveAttribute("aria-checked", "false");
    expect(stagingTarget).toBeDisabled();
  });

  it("uses target create test and select routes for engine management", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByRole("button", { name: "Add Engine Target" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Engine Target" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/engine/targets"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(testTargetPayload),
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Test Target" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/engine/targets/test"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(testTargetPayload),
        }),
      );
    });

    fireEvent.click(screen.getByRole("radio", { name: "Prod Server" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/engine/select"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ targetId: "prod-ssh" }),
        }),
      );
    });
  });
});
