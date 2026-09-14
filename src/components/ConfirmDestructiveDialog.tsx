import { TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** How many names a confirmation spells out before it summarises the rest. */
const MAX_LISTED_ITEMS = 8;

/**
 * "Delete volume" for one, "Delete 3 volumes" for several — the title and the
 * confirm button share it so they never disagree about what is at stake, and a
 * single item never reads as the stilted "Delete 1 volume".
 */
export function destructiveActionLabel(verb: string, count: number, noun: string) {
  return count === 1 ? `${verb} ${noun}` : `${verb} ${count} ${noun}s`;
}

export interface DestructiveConfirmation {
  /** Sentence-case question naming the action: "Delete volume?", "Delete 3 containers?". */
  title: string;
  /** What DockLite is about to do. Say it plainly; the names live in `items`. */
  description: string;
  /**
   * The exact resources at stake, listed so the user can check them before
   * confirming. Always populated — a confirmation that cannot name what it is
   * about to destroy is the "Are you sure?" this dialog exists to replace.
   */
  items: string[];
  /** What cannot be undone. Omit only where nothing is actually lost. */
  consequence?: string;
  /** Names the action on the button: "Delete volume", "Remove 3 images". */
  confirmLabel: string;
}

interface ConfirmDestructiveDialogProps {
  /** Kept mounted while closing so the dialog animates out instead of vanishing. */
  request: DestructiveConfirmation | null;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one confirmation every destructive action in DockLite goes through.
 *
 * Shape follows `PromptDialog`: a thin wrapper over the shadcn primitive that
 * the pages drive with props, so the copy stays at the call site where the
 * specifics are known. Built on `AlertDialog` rather than `Dialog` because the
 * primitive already gives us the things that matter most here — the focus trap,
 * Escape to cancel, `role="alertdialog"` wired to the title and description,
 * and opening focus on Cancel rather than the destructive button.
 *
 * Reach for it only for actions that destroy something. Confirming a start or a
 * restart just teaches people to click through the ones that matter.
 */
export function ConfirmDestructiveDialog({ request, open, onConfirm, onCancel }: ConfirmDestructiveDialogProps) {
  const listed = request?.items.slice(0, MAX_LISTED_ITEMS) ?? [];
  const remaining = (request?.items.length ?? 0) - listed.length;

  return (
    <AlertDialog
      open={open && request !== null}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      {request ? (
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{request.title}</AlertDialogTitle>
            <AlertDialogDescription>{request.description}</AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-background/60 px-3 py-2">
            {listed.map((item, index) => (
              <li key={`${item}-${index}`} className="break-all font-mono text-xs text-foreground">
                {item}
              </li>
            ))}
            {remaining > 0 ? (
              <li className="font-mono text-xs text-muted-foreground">and {remaining} more</li>
            ) : null}
          </ul>

          {request.consequence ? (
            <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-red-200">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300" />
              <span>{request.consequence}</span>
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive font-mono text-xs text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirm}
            >
              {request.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
