import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Containers from "@/pages/Containers";

describe("Containers Page", () => {
  it("renders container list", () => {
    render(
      <MemoryRouter>
        <Containers />
      </MemoryRouter>
    );
    expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.getByText("postgres-db")).toBeInTheDocument();
  });

  it("filters containers by name", () => {
    render(
      <MemoryRouter>
        <Containers />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText("Filter containers...");
    fireEvent.change(input, { target: { value: "nginx" } });
    expect(screen.getByText("nginx-proxy")).toBeInTheDocument();
    expect(screen.queryByText("postgres-db")).not.toBeInTheDocument();
  });

  it("filters containers by image", () => {
    render(
      <MemoryRouter>
        <Containers />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText("Filter containers...");
    fireEvent.change(input, { target: { value: "redis" } });
    expect(screen.getByText("redis-cache")).toBeInTheDocument();
    expect(screen.queryByText("nginx-proxy")).not.toBeInTheDocument();
  });

  it("shows Run Container button", () => {
    render(
      <MemoryRouter>
        <Containers />
      </MemoryRouter>
    );
    expect(screen.getByText("Run Container")).toBeInTheDocument();
  });
});
