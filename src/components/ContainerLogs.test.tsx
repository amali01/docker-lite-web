import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ContainerLogs } from "@/components/ContainerLogs";
import { ContainerLogLine } from "@/lib/api/types";

interface MockEventSourceInstance {
  emit: (type: string, payload: unknown) => void;
  listeners: Map<string, Set<(event: MessageEvent<string>) => void>>;
}

function getInstances(): MockEventSourceInstance[] {
  return (globalThis.EventSource as unknown as { instances: MockEventSourceInstance[] }).instances;
}

function line(msg: string): ContainerLogLine {
  return { time: new Date().toISOString(), msg };
}

describe("ContainerLogs", () => {
  it("renders with container name", () => {
    render(<ContainerLogs containerId="ctr-1" containerName="test-container" onClose={() => {}} />);
    expect(screen.getByText(/test-container/)).toBeInTheDocument();
  });

  it("shows streamed log lines", () => {
    render(<ContainerLogs containerId="ctr-1" containerName="my-app" onClose={() => {}} />);
    const eventSource = getInstances().at(-1);
    act(() => {
      eventSource?.emit("log", {
        containerId: "ctr-1",
        lines: [line("Starting application...")],
      });
    });
    expect(screen.getByText(/Starting application/)).toBeInTheDocument();
  });

  it("clears logs when clear button clicked", () => {
    render(<ContainerLogs containerId="ctr-1" containerName="my-app" onClose={() => {}} />);
    const eventSource = getInstances().at(-1);
    act(() => {
      eventSource?.emit("log", {
        containerId: "ctr-1",
        lines: [line("line")],
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

  it("does not duplicate the backlog across a pause/resume cycle", () => {
    render(<ContainerLogs containerId="ctr-1" containerName="my-app" onClose={() => {}} />);
    const instancesBefore = getInstances().length;
    const initial = getInstances().at(-1);

    // Initial connect: server replays its tail backlog.
    act(() => {
      initial?.emit("log", { containerId: "ctr-1", lines: [line("L1"), line("L2"), line("L3")] });
    });
    expect(screen.getAllByText(/^L1$/)).toHaveLength(1);

    fireEvent.click(screen.getByTitle("Pause"));

    // A line arrives while paused: the view must not update yet.
    act(() => {
      getInstances().at(-1)?.emit("log", { containerId: "ctr-1", lines: [line("L4")] });
    });
    expect(screen.queryByText(/^L4$/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Resume"));

    // If resuming reopened the connection, the server would replay the same
    // backlog on the new one — reproduce that here to guard against it.
    if (getInstances().length > instancesBefore) {
      act(() => {
        getInstances().at(-1)?.emit("log", { containerId: "ctr-1", lines: [line("L1"), line("L2"), line("L3")] });
      });
    }

    expect(getInstances().length).toBe(instancesBefore);
    expect(screen.getAllByText(/^L1$/)).toHaveLength(1);
    expect(screen.getAllByText(/^L2$/)).toHaveLength(1);
    expect(screen.getAllByText(/^L3$/)).toHaveLength(1);
    expect(screen.getAllByText(/^L4$/)).toHaveLength(1);
  });

  it("caps the buffer to the newest lines instead of growing without bound", () => {
    render(<ContainerLogs containerId="ctr-1" containerName="my-app" onClose={() => {}} />);
    const eventSource = getInstances().at(-1);
    const total = 2005;
    const chunk = Array.from({ length: total }, (_, i) => line(`N${i}`));

    act(() => {
      eventSource?.emit("log", { containerId: "ctr-1", lines: chunk });
    });

    expect(screen.getByText("(2000 lines)")).toBeInTheDocument();
    expect(screen.queryByText(/^N0$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^N4$/)).not.toBeInTheDocument();
    expect(screen.getByText(/^N5$/)).toBeInTheDocument();
    expect(screen.getByText(/^N2004$/)).toBeInTheDocument();
  });

  it("drops a malformed frame without crashing or going silent", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ContainerLogs containerId="ctr-1" containerName="my-app" onClose={() => {}} />);
    const eventSource = getInstances().at(-1);
    const listener = eventSource?.listeners.get("log")?.values().next().value;

    expect(() => {
      act(() => {
        listener?.({ data: "{not valid json" } as MessageEvent<string>);
      });
    }).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();

    // The stream keeps working after the bad frame.
    act(() => {
      eventSource?.emit("log", { containerId: "ctr-1", lines: [line("after-malformed")] });
    });
    expect(screen.getByText(/after-malformed/)).toBeInTheDocument();

    errorSpy.mockRestore();
  });
});
