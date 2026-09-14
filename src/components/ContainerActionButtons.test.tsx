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
   * `useContainerActions`, which owns the mutations and gates remove and
   * rebuild. Each of the three callers routes through that hook.
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

  it("raises no confirmation of its own — that belongs to the caller that owns the mutation", () => {
    const onAction = vi.fn();
    render(
      <MemoryRouter>
        <ContainerActionButtons container={runningContainer} onAction={onAction} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove container nginx-proxy" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("drops the Details link when the caller is already on the detail route", () => {
    render(
      <MemoryRouter>
        <ContainerActionButtons container={runningContainer} showDetailsLink={false} onAction={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "View details for nginx-proxy" })).not.toBeInTheDocument();
    // The actions themselves are untouched by hiding the link.
    expect(screen.getByRole("button", { name: "Remove container nginx-proxy" })).toBeInTheDocument();
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
