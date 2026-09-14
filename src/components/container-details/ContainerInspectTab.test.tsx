import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { ContainerInspectTab } from "./ContainerInspectTab";
import type { ContainerInspectView } from "@/lib/api/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const inspect: ContainerInspectView = { raw: { Id: "abc123", Name: "/web" } };

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  Reflect.deleteProperty(document, "execCommand");
  vi.clearAllMocks();
});

describe("ContainerInspectTab", () => {
  it("copies JSON via the async clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<ContainerInspectTab inspect={inspect} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(inspect.raw, null, 2)));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("falls back to execCommand and still succeeds when the async API is missing", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);

    // Surface an unhandled rejection if the component still reaches for the
    // (here, absent) async API directly instead of going through a guarded path.
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on("unhandledRejection", onUnhandledRejection);

    render(<ContainerInspectTab inspect={inspect} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));

    await vi.waitFor(() => expect(document.execCommand).toHaveBeenCalledWith("copy"));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", onUnhandledRejection);
    expect(unhandledRejections).toHaveLength(0);
  });

  it("shows a visible failure when neither copy path is available", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    // execCommand left undefined, matching jsdom/older-browser reality.

    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on("unhandledRejection", onUnhandledRejection);

    render(<ContainerInspectTab inspect={inspect} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", onUnhandledRejection);
    expect(unhandledRejections).toHaveLength(0);
  });
});
