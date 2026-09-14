import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import DockerSettings from "@/pages/DockerSettings";
import { resetAuthRuntimeState, setAuthRuntimeState } from "@/lib/api/client";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn<typeof fetch>();
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
  {
    // Configured with tlsMode "mtls" and client cert/key paths on the server;
    // the public projection redacts all of that and exposes only the endpoint.
    id: "staging-tls",
    label: "Staging TLS",
    endpoint: "tcp://staging.example.internal:2376",
    active: false,
    available: true,
    kind: "tcpTls",
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

      if (/\/api\/engine\/targets\/[^/]+$/.test(url) && method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify(createTargetResponse)));
      }

      if (/\/api\/engine\/targets\/[^/]+$/.test(url) && method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
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

  async function patchBodyAfterLabelEdit(targetLabel: string, nextLabel: string, alsoEdit?: () => void) {
    renderWithProviders(<DockerSettings />);

    const card = await screen.findByRole("group", { name: `Engine target ${targetLabel}` });
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));

    fireEvent.change(screen.getByLabelText("Label"), { target: { value: nextLabel } });
    alsoEdit?.();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    const findPatchBody = () => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      const body = patchCall?.[1]?.body;
      return typeof body === "string" ? body : null;
    };

    await waitFor(() => {
      expect(findPatchBody()).not.toBeNull();
    });

    const parsed: unknown = JSON.parse(String(findPatchBody()));
    return parsed;
  }

  it("renaming an mTLS target does not send a TLS mode or credential paths (H4)", async () => {
    // Regression test for CODE-AUDIT.md H4: the edit form used to fall back to
    // defaultDraft for everything the redacted projection hides, so a rename
    // shipped tlsMode "serverOnly" and silently disabled client certificates.
    const body = await patchBodyAfterLabelEdit("Staging TLS", "Staging TLS (eu)");

    expect(body).toEqual({
      kind: "tcpTls",
      label: "Staging TLS (eu)",
      host: "staging.example.internal",
      port: 2376,
    });
    expect(body).not.toHaveProperty("tlsMode");
    expect(body).not.toHaveProperty("caPath");
    expect(body).not.toHaveProperty("certPath");
    expect(body).not.toHaveProperty("keyPath");
  });

  it("rotating an mTLS target's CA path leaves its TLS mode alone (H4)", async () => {
    // The audited scenario in full: the old form demanded a CA path before it
    // would save a TLS target, and then shipped the defaultDraft tlsMode
    // "serverOnly" alongside it, turning client certificates off.
    const body = await patchBodyAfterLabelEdit("Staging TLS", "Staging TLS", () => {
      fireEvent.change(screen.getByLabelText("CA Certificate Path"), {
        target: { value: "/etc/docklite/ca-2027.pem" },
      });
    });

    expect(body).toEqual({
      kind: "tcpTls",
      label: "Staging TLS",
      host: "staging.example.internal",
      port: 2376,
      caPath: "/etc/docklite/ca-2027.pem",
    });
    expect(body).not.toHaveProperty("tlsMode");
  });

  it("renaming an SSH target does not send an auth mode or port (H4)", async () => {
    // Same fault on the SSH side: a rename used to reset keyFile auth to agent
    // and a non-22 port back to 22.
    const body = await patchBodyAfterLabelEdit("Prod Server", "Prod Server (eu)");

    expect(body).toEqual({
      kind: "ssh",
      label: "Prod Server (eu)",
      host: "prod.example.internal",
      username: "ops",
    });
    expect(body).not.toHaveProperty("authMode");
    expect(body).not.toHaveProperty("port");
    expect(body).not.toHaveProperty("keyPath");
  });

  it("does not delete an engine target until the confirmation is accepted", async () => {
    renderWithProviders(<DockerSettings />);

    const targetCard = await screen.findByRole("group", { name: "Engine target Prod Server" });
    fireEvent.click(within(targetCard).getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Delete engine target?");
    expect(within(dialog).getByText("Prod Server — ssh://ops@prod.example.internal")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete target" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/engine/targets/prod-ssh"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("keeps the engine target when the confirmation is cancelled", async () => {
    renderWithProviders(<DockerSettings />);

    const targetCard = await screen.findByRole("group", { name: "Engine target Prod Server" });
    fireEvent.click(within(targetCard).getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));
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
