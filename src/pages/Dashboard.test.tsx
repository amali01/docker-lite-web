import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";

describe("Dashboard", () => {
  it("renders dashboard heading", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("shows container stats", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    expect(screen.getByText("Containers")).toBeInTheDocument();
    expect(screen.getByText("Images")).toBeInTheDocument();
    expect(screen.getByText("Volumes")).toBeInTheDocument();
    expect(screen.getByText("Networks")).toBeInTheDocument();
  });

  it("shows system information", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    expect(screen.getByText("System Information")).toBeInTheDocument();
    expect(screen.getByText(/25.0.3/)).toBeInTheDocument();
  });

  it("renders container rows", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.getByText("postgres-db")).toBeInTheDocument();
  });
});
