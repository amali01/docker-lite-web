import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import Login from "@/pages/Login";
import { resetAuthRuntimeState } from "@/lib/api/client";
import { renderWithProviders } from "@/test/render";

const fetchMock = vi.fn();

describe("Login", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    resetAuthRuntimeState();
  });

  function renderLoginRoute() {
    return renderWithProviders(
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Dashboard route reached</div>} />
      </Routes>,
      "/login",
    );
  }

  it("signs in with username and password", async () => {
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

      if (url.endsWith("/api/auth/login") && method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          username: "admin",
          token: "jwt-token",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          defaultCredentialsActive: true,
        })));
      }

      return Promise.reject(new Error(`Unhandled ${method} ${url}`));
    });

    renderLoginRoute();

    expect(await screen.findByRole("heading", { name: "Admin Login" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Admin user"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Admin password"), {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/login"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ username: "admin", password: "admin" }),
        }),
      );
    });
  });

  it("shows the default-credential guidance when it is active", async () => {
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

    renderLoginRoute();

    expect(await screen.findByText("Default credentials are active. Sign in with admin / admin and change them in Settings.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("admin")).toBeInTheDocument();
  });
});
