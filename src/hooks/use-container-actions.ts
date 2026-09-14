import { toast } from "sonner";
import { destructiveActionLabel, type DestructiveConfirmation } from "@/components/ConfirmDestructiveDialog";
import { useConfirmDestructive } from "@/hooks/use-confirm-destructive";
import {
  useRebuildContainer,
  useRemoveContainer,
  useRestartContainer,
  useStartContainer,
  useStopContainer,
} from "@/hooks/use-containers";
import { ContainerSummary } from "@/lib/api/types";
import { pluralize, runBulkAction, type BulkActionOutcome } from "@/lib/bulk-action";

/** The container mutations shared by the Dashboard and Containers tables. */
export type ContainerAction = "start" | "stop" | "restart" | "rebuild" | "remove";

const PAST_TENSE: Record<ContainerAction, string> = {
  start: "Started",
  stop: "Stopped",
  restart: "Restarted",
  rebuild: "Refreshed",
  remove: "Removed",
};

/**
 * Start, stop and restart are not confirmed: they are reversible with the
 * button next to the one that was just pressed, and confirming them would only
 * train people to click through the two below that genuinely destroy something.
 */
const NEEDS_CONFIRMATION: ContainerAction[] = ["remove", "rebuild"];

/** Lost-on-removal wording, kept identical wherever a container is destroyed. */
const writableLayerWarning = (count: number) =>
  `Anything written inside ${count === 1 ? "the container" : "these containers"} and not saved to a volume is lost.`;

/**
 * The copy for removing containers, built in one place so the Containers table,
 * the Dashboard table and both compose-stack rows say the same thing.
 */
export function describeContainerRemoval(containers: ContainerSummary[], project?: string): DestructiveConfirmation {
  const names = containers.map((container) => container.name);

  if (project) {
    return {
      title: "Delete compose stack?",
      description: `DockLite will force-remove all ${pluralize(containers.length, "container")} labelled for ${project}.`,
      items: names,
      consequence: writableLayerWarning(containers.length),
      confirmLabel: "Delete stack",
    };
  }

  const label = destructiveActionLabel("Delete", containers.length, "container");

  return {
    title: `${label}?`,
    description: `DockLite will force-remove ${containers.length === 1 ? "this container" : "these containers"} from the engine.`,
    items: names,
    consequence: writableLayerWarning(containers.length),
    confirmLabel: label,
  };
}

/** Rebuild destroys the container and recreates it, so it is confirmed like a delete. */
function describeContainerRebuild(container: ContainerSummary): DestructiveConfirmation {
  return {
    title: "Rebuild container?",
    description:
      "DockLite pulls a fresh copy of the image, then destroys this container and recreates it with the same settings.",
    items: [container.name],
    consequence: `The current container is force-removed once the replacement is up. ${writableLayerWarning(1)}`,
    confirmLabel: "Rebuild container",
  };
}

/**
 * One home for "act on a container and tell the user what happened", so the
 * Dashboard and Containers tables cannot drift apart again. Page-local concerns
 * (which log/terminal pane is open, compose-stack endpoints) stay in the pages;
 * `runAction` reports whether the mutation succeeded so a caller can follow up.
 */
export function useContainerActions() {
  const { confirm, confirmationDialog } = useConfirmDestructive();
  const startMutation = useStartContainer();
  const stopMutation = useStopContainer();
  const restartMutation = useRestartContainer();
  const rebuildMutation = useRebuildContainer();
  const removeMutation = useRemoveContainer();

  const mutate = (action: ContainerAction, containerId: string) => {
    switch (action) {
      case "start":
        return startMutation.mutateAsync(containerId);
      case "stop":
        return stopMutation.mutateAsync(containerId);
      case "restart":
        return restartMutation.mutateAsync(containerId);
      case "rebuild":
        return rebuildMutation.mutateAsync(containerId);
      case "remove":
        return removeMutation.mutateAsync(containerId);
    }
  };

  const runAction = async (action: ContainerAction, container: ContainerSummary): Promise<boolean> => {
    if (NEEDS_CONFIRMATION.includes(action)) {
      const request = action === "rebuild" ? describeContainerRebuild(container) : describeContainerRemoval([container]);

      if (!(await confirm(request))) {
        return false;
      }
    }

    try {
      if (action === "rebuild") {
        // Rebuild pulls and recreates; say something before the long wait.
        toast.info(`Refreshing ${container.name}...`);
      }

      await mutate(action, container.id);
      toast.success(`${PAST_TENSE[action]} ${container.name}`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Docker action failed");
      return false;
    }
  };

  /** Resolves to `null` when the user declined the confirmation, so the caller can leave the selection alone. */
  const runBulk = async (
    action: ContainerAction,
    containers: ContainerSummary[],
    context?: string,
  ): Promise<BulkActionOutcome<ContainerSummary> | null> => {
    if (action === "remove" && !(await confirm(describeContainerRemoval(containers, context)))) {
      return null;
    }

    return runBulkAction(containers, (container) => mutate(action, container.id), {
      verb: PAST_TENSE[action],
      noun: "container",
      ...(context ? { context } : {}),
    });
  };

  return { runAction, runBulk, confirm, confirmationDialog };
}
