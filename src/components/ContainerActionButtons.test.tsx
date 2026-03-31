import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
      <ContainerActionButtons
        container={runningContainer}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Stop container nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh container nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart container nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View logs for nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open terminal for nginx-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove container nginx-proxy" })).toBeInTheDocument();
  });

  it("communicates when terminal is unavailable", () => {
    const onAction = vi.fn();
    render(
      <ContainerActionButtons
        container={{ ...runningContainer, status: "stopped" }}
        onAction={onAction}
      />,
    );

    const button = screen.getByRole("button", { name: "Open terminal for nginx-proxy (container must be running)" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });
});
