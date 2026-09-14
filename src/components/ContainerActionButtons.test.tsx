import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContainerActionButtons } from "@/components/ContainerActionButtons";
import { ContainerSummary } from "@/lib/api/types";

const runningContainer: ContainerSummary = {
  id: "ctr-1",
  name: "nginx-proxy",
  image: "nginx:alpine",
  composeProject: null,
  composeService: null,
  status: "running",
  state: "Up 3 hours",
  ports: "80/tcp",
  created: new Date().toISOString(),
  cpuPercent: 0.12,
  memUsage: "20 MiB",
  memPercent: 5,
  netIO: "1 MB / 1 MB",
  memLimit: "512 MiB",
  blockIO: "0 B / 0 B",
};

describe("ContainerActionButtons", () => {
  it("exposes accessible names for icon-only controls", () => {
    render(
      <MemoryRouter>
        <ContainerActionButtons
          container={runningContainer}
          onAction={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "View details for nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop container nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh container nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart container nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View logs for nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open terminal for nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove container nginx-proxy" })).toBeInTheDocument();
  });

  /**
   * Every single-container destructive click in the app funnels through here,
   * and this component performs no mutation of its own — it hands the action to
   * its caller. Confirmation therefore lives one level up, in
   * `useContainerActions`, which owns the mutations; gating here instead would
   * put a confirmation in front of callers that pass a no-op handler and tell
   * the user something was destroyed when nothing was.
   */
  it("delegates destructive clicks to the caller rather than acting on its own", () => {
    const onAction = vi.fn();
    render(
      <MemoryRouter>
        <ContainerActionButtons container={runningContainer} onAction={onAction} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove container nginx-proxy" }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith("remove", runningContainer);

    onAction.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Refresh container nginx-proxy" }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith("rebuild", runningContainer);
  });

  it("shows no confirmation of its own, so a no-op caller destroys nothing and claims nothing", () => {
    render(
      <MemoryRouter>
        <ContainerActionButtons container={runningContainer} onAction={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove container nginx-proxy" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("communicates when terminal is unavailable", () => {
    const onAction = vi.fn();
    render(
      <MemoryRouter>
        <ContainerActionButtons
          container={{ ...runningContainer, status: "stopped" }}
          onAction={onAction}
        />
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: "Open terminal for nginx-proxy (container must be running)" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });
});
