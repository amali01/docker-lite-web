import { useCallback, useRef, useState } from "react";
import { ConfirmDestructiveDialog, type DestructiveConfirmation } from "@/components/ConfirmDestructiveDialog";

/**
 * Puts the shared confirmation in front of a destructive handler without
 * rewriting the handler:
 *
 *   const { confirm, confirmationDialog } = useConfirmDestructive();
 *
 *   const handleRemove = async (volume: VolumeSummary) => {
 *     if (!(await confirm({ ... }))) return;
 *     // ...unchanged
 *   };
 *
 * `confirmationDialog` is rendered once per page; one dialog serves every
 * destructive action on it, because only one can be answered at a time anyway.
 */
export function useConfirmDestructive() {
  const [request, setRequest] = useState<DestructiveConfirmation | null>(null);
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  // Escape, the overlay, Cancel and the confirm button all land here. Whichever
  // arrives first answers the promise; the rest find the resolver already spent.
  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOpen(false);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((next: DestructiveConfirmation) => {
    // A prompt still waiting when another arrives counts as declined, so its
    // caller never hangs on a promise nothing will resolve.
    resolveRef.current?.(false);
    setRequest(next);
    setOpen(true);

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  return {
    confirm,
    confirmationDialog: (
      <ConfirmDestructiveDialog
        request={request}
        open={open}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    ),
  };
}
