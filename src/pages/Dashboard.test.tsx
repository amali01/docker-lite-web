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
    expect(screen.getAllByText("Containers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Images").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Volumes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Networks").length).toBeGreaterThan(0);
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
