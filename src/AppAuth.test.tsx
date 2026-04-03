import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "@/App";
import { resetAuthRuntimeState } from "@/lib/api/client";

const fetchMock = vi.fn();

describe("App auth gating", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetAuthRuntimeState();
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");
  });

  it("renders the login flow when the user is not authenticated", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/session") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({
          authenticated: false,
          username: null,
          expiresAt: null,
          defaultCredentialsActive: true,
          message: "Default credentials are active. Sign in with admin / admin and change them in Settings.",
        })));
      }

      return Promise.reject(new Error(`Unhandled ${method} ${url}`));
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Admin Login" })).toBeInTheDocument();
    expect(screen.getByText("Default credentials are active. Sign in with admin / admin and change them in Settings.")).toBeInTheDocument();
  });

  it("renders the dashboard when the session is authenticated", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/session") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({
          authenticated: true,
          username: "admin",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          defaultCredentialsActive: false,
          message: null,
        })));
      }

      if (url.endsWith("/api/engine") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({
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
        })));
      }

      if (url.endsWith("/api/containers") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([])));
      }

      if (url.endsWith("/api/images") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([])));
      }

      if (url.endsWith("/api/volumes") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([])));
      }

      if (url.endsWith("/api/networks") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([])));
      }

      return Promise.reject(new Error(`Unhandled ${method} ${url}`));
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});
