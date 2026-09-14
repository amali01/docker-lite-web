import { toast } from "sonner";
import {
  useRebuildContainer,
  useRemoveContainer,
  useRestartContainer,
  useStartContainer,
  useStopContainer,
} from "@/hooks/use-containers";
import { ContainerSummary } from "@/lib/api/types";
import { runBulkAction, type BulkActionOutcome } from "@/lib/bulk-action";

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
 * One home for "act on a container and tell the user what happened", so the
 * Dashboard and Containers tables cannot drift apart again. Page-local concerns
 * (which log/terminal pane is open, compose-stack endpoints) stay in the pages;
 * `runAction` reports whether the mutation succeeded so a caller can follow up.
 */
export function useContainerActions() {
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

  const runBulk = (
    action: ContainerAction,
    containers: ContainerSummary[],
    context?: string,
  ): Promise<BulkActionOutcome<ContainerSummary>> =>
    runBulkAction(containers, (container) => mutate(action, container.id), {
      verb: PAST_TENSE[action],
      noun: "container",
      ...(context ? { context } : {}),
    });

  return { runAction, runBulk };
}
