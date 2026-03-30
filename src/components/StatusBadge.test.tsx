import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders running status", () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("renders stopped status", () => {
    render(<StatusBadge status="stopped" />);
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });

  it("renders paused status", () => {
    render(<StatusBadge status="paused" />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("renders restarting status", () => {
    render(<StatusBadge status="restarting" />);
    expect(screen.getByText("Restarting")).toBeInTheDocument();
  });
});
