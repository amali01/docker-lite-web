/// <reference types="node" />
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PromptDialog } from "@/components/PromptDialog";

describe("PromptDialog", () => {
  it("stays open with the typed value and clears pending when onSubmit rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));
    const onOpenChange = vi.fn();

    // vitest runs the DOM in jsdom on top of a real Node process, so a promise
    // rejection an async onClick handler leaves uncaught surfaces as a Node
    // `unhandledRejection`, not a jsdom `window` event.
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    const { rerender } = render(
      <PromptDialog
        open
        title="Create Volume"
        label="Volume name"
        placeholder="e.g. postgres-data"
        confirmLabel="Create Volume"
        pending={false}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. postgres-data"), {
      target: { value: "my-volume" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Volume" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("my-volume"));

    // Caller clears `pending` once its mutation settles (success or failure).
    rerender(
      <PromptDialog
        open
        title="Create Volume"
        label="Volume name"
        placeholder="e.g. postgres-data"
        confirmLabel="Create Volume"
        pending={false}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    );

    // Dialog must not have closed on failure, and the typed value must survive.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByPlaceholderText("e.g. postgres-data")).toHaveValue("my-volume");

    // Give any unhandled rejection a tick to surface.
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", onUnhandledRejection);

    expect(unhandledRejections).toHaveLength(0);
  });
});
