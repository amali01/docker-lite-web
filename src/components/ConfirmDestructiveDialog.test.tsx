import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfirmDestructiveDialog, type DestructiveConfirmation } from "@/components/ConfirmDestructiveDialog";

const request: DestructiveConfirmation = {
  title: "Delete volume?",
  description: "DockLite will delete this volume from the engine.",
  items: ["postgres-data"],
  consequence: "The data in this volume is destroyed.",
  confirmLabel: "Delete volume",
};

function renderDialog(overrides: Partial<DestructiveConfirmation> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  render(
    <ConfirmDestructiveDialog
      request={{ ...request, ...overrides }}
      open
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );

  return { onConfirm, onCancel };
}

describe("ConfirmDestructiveDialog", () => {
  it("names what will be destroyed and what it costs", async () => {
    renderDialog();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Delete volume?");
    expect(dialog).toHaveAccessibleDescription("DockLite will delete this volume from the engine.");
    expect(within(dialog).getByText("postgres-data")).toBeInTheDocument();
    expect(within(dialog).getByText("The data in this volume is destroyed.")).toBeInTheDocument();
  });

  it("labels the confirm button with the action rather than OK", async () => {
    renderDialog();

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Delete volume" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "OK" })).not.toBeInTheDocument();
  });

  it("opens with focus on Cancel so a stray Enter destroys nothing", async () => {
    const { onConfirm, onCancel } = renderDialog();

    const dialog = await screen.findByRole("alertdialog");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });

    await waitFor(() => {
      expect(cancel).toHaveFocus();
    });

    fireEvent.keyDown(cancel, { key: "Enter", code: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape", async () => {
    const { onConfirm, onCancel } = renderDialog();

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms only when the destructive button is pressed", async () => {
    const { onConfirm } = renderDialog();

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete volume" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("states the count and summarises a long list instead of scrolling forever", async () => {
    const items = Array.from({ length: 11 }, (_, index) => `volume-${index + 1}`);
    renderDialog({ title: "Delete 11 volumes?", items, confirmLabel: "Delete 11 volumes" });

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Delete 11 volumes?");
    expect(within(dialog).getByText("volume-8")).toBeInTheDocument();
    expect(within(dialog).queryByText("volume-9")).not.toBeInTheDocument();
    expect(within(dialog).getByText("and 3 more")).toBeInTheDocument();
  });

  it("renders nothing until a request arrives", () => {
    render(<ConfirmDestructiveDialog request={null} open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
