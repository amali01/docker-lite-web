import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContainerLogs } from "@/components/ContainerLogs";

describe("ContainerLogs", () => {
  it("renders with container name", () => {
    render(<ContainerLogs containerName="test-container" onClose={() => {}} />);
    expect(screen.getByText(/test-container/)).toBeInTheDocument();
  });

  it("shows log lines", () => {
    render(<ContainerLogs containerName="my-app" onClose={() => {}} />);
    expect(screen.getByText(/Starting application/)).toBeInTheDocument();
  });

  it("clears logs when clear button clicked", () => {
    render(<ContainerLogs containerName="my-app" onClose={() => {}} />);
    const clearBtn = screen.getByTitle("Clear");
    fireEvent.click(clearBtn);
    expect(screen.getByText("No logs available.")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    let closed = false;
    render(<ContainerLogs containerName="my-app" onClose={() => { closed = true; }} />);
    fireEvent.click(screen.getByTitle("Close"));
    expect(closed).toBe(true);
  });
});
