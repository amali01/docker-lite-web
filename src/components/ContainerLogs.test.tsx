import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ContainerLogs } from "@/components/ContainerLogs";

describe("ContainerLogs", () => {
  it("renders with container name", () => {
    render(<ContainerLogs containerId="ctr-1" containerName="test-container" onClose={() => {}} />);
    expect(screen.getByText(/test-container/)).toBeInTheDocument();
  });

  it("shows streamed log lines", () => {
    render(<ContainerLogs containerId="ctr-1" containerName="my-app" onClose={() => {}} />);
    const eventSource = (globalThis.EventSource as unknown as { instances: Array<{ emit: (type: string, payload: unknown) => void }> }).instances.at(-1);
    act(() => {
      eventSource?.emit("log", {
        containerId: "ctr-1",
        lines: [{ time: new Date().toISOString(), msg: "Starting application..." }],
      });
    });
    expect(screen.getByText(/Starting application/)).toBeInTheDocument();
  });

  it("clears logs when clear button clicked", () => {
    render(<ContainerLogs containerId="ctr-1" containerName="my-app" onClose={() => {}} />);
    const eventSource = (globalThis.EventSource as unknown as { instances: Array<{ emit: (type: string, payload: unknown) => void }> }).instances.at(-1);
    act(() => {
      eventSource?.emit("log", {
        containerId: "ctr-1",
        lines: [{ time: new Date().toISOString(), msg: "line" }],
      });
    });
    const clearButton = screen.getByTitle("Clear");
    fireEvent.click(clearButton);
    expect(screen.getByText("Waiting for logs...")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    let closed = false;
    render(<ContainerLogs containerId="ctr-1" containerName="my-app" onClose={() => { closed = true; }} />);
    fireEvent.click(screen.getByTitle("Close"));
    expect(closed).toBe(true);
  });
});
