import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import DockerSettings from "@/pages/DockerSettings";
import { resetAuthRuntimeState, setAuthRuntimeState } from "@/lib/api/client";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();
const testTargetPayload = {
  kind: "ssh",
  label: "Prod Server",
  host: "prod.example.internal",
  port: 22,
  username: "ops",
  authMode: "agent",
  keyPath: null,
  knownHostsPath: null,
  dockerHostOverride: null,
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
] as const;

const authConfigFixture = {
  adminUsername: "admin",
  defaultCredentialsActive: true,
  loginRequired: true,
  canDisableLogin: true,
} as const;

describe("DockerSettings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    resetAuthRuntimeState();
    setAuthRuntimeState({ token: "jwt-token" });

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/session") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({
          authenticated: true,
          username: "admin",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          defaultCredentialsActive: true,
          message: null,
        })));
      }

      if (url.endsWith("/api/auth/config") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(authConfigFixture)));
      }

      if (url.endsWith("/api/auth/login-required") && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ ...authConfigFixture, loginRequired: false })),
        );
      }

      if (url.endsWith("/api/auth/credentials") && method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          username: "operator",
          token: "next-token",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          defaultCredentialsActive: false,
        })));
      }

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
            endpoint: "unix:///home/user/.docker/desktop/docker.sock",
            selectedEngineId: "desktop-linux",
          })),
        );
      }

      if (url.endsWith("/api/engine/targets") && method === "POST") {
        expect(JSON.parse(String(init?.body))).toEqual(testTargetPayload);
        return Promise.resolve(new Response(JSON.stringify(createTargetResponse)));
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

  it("associates settings fields with accessible labels", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByLabelText("Backend Base URL")).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: "System Docker" })).toBeInTheDocument();
    expect(screen.getByLabelText("Docker Endpoint")).toBeInTheDocument();
    expect(screen.getByLabelText("API Version")).toBeInTheDocument();
  });

  it("shows available docker engines and lets the user switch", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByRole("radio", { name: "System Docker" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Prod Server" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/engine/select"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("uses target create test and select routes for engine management", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByRole("button", { name: "Add Engine Target" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Prod Server" },
    });
    fireEvent.change(screen.getByLabelText("Host"), {
      target: { value: "prod.example.internal" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "ops" },
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
  });

  it("disables login after confirming the Require login toggle", async () => {
    renderWithProviders(<DockerSettings />);

    const toggle = await screen.findByRole("switch", { name: /require login/i });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Disable login" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/login-required"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ required: false }),
        }),
      );
    });
  });

  it("renders admin credential controls instead of TLS settings", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByText("Admin Credentials")).toBeInTheDocument();
    expect(await screen.findByLabelText("Admin Username")).toHaveValue("admin");
    expect(screen.getByLabelText("Admin Password")).toHaveValue("");
    expect(screen.queryByLabelText("TLS Certificate Path")).not.toBeInTheDocument();
  });

  it("submits updated admin credentials", async () => {
    renderWithProviders(<DockerSettings />);

    expect(await screen.findByLabelText("Admin Username")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Admin Username"), {
      target: { value: "operator" },
    });
    fireEvent.change(screen.getByLabelText("Admin Password"), {
      target: { value: "docklite-next" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Credentials" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/credentials"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            username: "operator",
            password: "docklite-next",
          }),
        }),
      );
    });
  });
});
