import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContainerStatsSample } from "@/lib/api/types";
import {
  getContainerDetails,
  getContainerInspect,
  getContainerStats,
  listContainers,
  removeComposeProject,
  removeContainer,
  restartContainer,
  rebuildContainer,
  runContainer,
  startComposeProject,
  startContainer,
  stopComposeProject,
  stopContainer,
} from "@/lib/api/resources";
import { engineQueryKey, useEngineInfo } from "@/hooks/use-engine";

export const containersQueryKey = ["containers"] as const;

export function useContainers() {
  return useQuery({
    queryKey: containersQueryKey,
    queryFn: listContainers,
    refetchInterval: 10000,
  });
}

export function useContainerDetails(containerId?: string) {
  const engineQuery = useEngineInfo();
  const selectedEngineId = engineQuery.data?.selectedEngineId ?? null;

  return useQuery({
    queryKey: ["container-details", selectedEngineId, containerId ?? null] as const,
    queryFn: () => getContainerDetails(containerId ?? ""),
    enabled: Boolean(selectedEngineId && containerId),
  });
}

export function useContainerInspect(containerId?: string) {
  const engineQuery = useEngineInfo();
  const selectedEngineId = engineQuery.data?.selectedEngineId ?? null;

  return useQuery({
    queryKey: ["container-inspect", selectedEngineId, containerId ?? null] as const,
    queryFn: () => getContainerInspect(containerId ?? ""),
    enabled: Boolean(selectedEngineId && containerId),
  });
}

export function useContainerStats(containerId?: string, refetchInterval?: number) {
  const engineQuery = useEngineInfo();
  const selectedEngineId = engineQuery.data?.selectedEngineId ?? null;

  return useQuery({
    queryKey: ["container-stats", selectedEngineId, containerId ?? null] as const,
    queryFn: () => getContainerStats(containerId ?? ""),
    enabled: Boolean(selectedEngineId && containerId),
    refetchInterval: refetchInterval ?? false,
  });
}

/** One poll per open Stats tab. The list already costs the daemon a stats call
 * per running container every 10s (CODE-AUDIT M8), so this stays slower than a
 * live `docker stats` and only runs while somebody is looking at the tab. */
export const STATS_POLL_INTERVAL_MS = 5000;
/** 2 minutes of history at the poll interval, and about as many bars as the
 * chart can show without turning into a smear. */
const STATS_HISTORY_LIMIT = 24;

/**
 * The stats endpoint answers with a single point-in-time sample, so history is
 * accumulated here, in the client, from repeated polls. It lives in the hook
 * rather than the Stats tab because it is query-lifecycle state: it resets when
 * the query key's container changes, and the polling stops when the last
 * observer unmounts — mount the hook only where the samples are on screen.
 *
 * ponytail: history is per mount and in memory, so leaving the Stats tab throws
 * it away. Persist it in the query cache (or stream stats from the server) if
 * anyone wants history that survives a tab switch.
 */
export function useContainerStatsHistory(containerId?: string): ContainerStatsSample[] {
  const { data: samples } = useContainerStats(containerId, STATS_POLL_INTERVAL_MS);
  const [history, setHistory] = useState<ContainerStatsSample[]>([]);

  useEffect(() => {
    setHistory([]);
  }, [containerId]);

  useEffect(() => {
    if (!samples || samples.length === 0) {
      return;
    }

    setHistory((previous) => {
      const lastSeen = previous.at(-1)?.sampledAt;
      const fresh = lastSeen === undefined ? samples : samples.filter((sample) => sample.sampledAt > lastSeen);
      return fresh.length === 0 ? previous : [...previous, ...fresh].slice(-STATS_HISTORY_LIMIT);
    });
  }, [samples]);

  return history;
}

export function useRunContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runContainer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: containersQueryKey });
    },
  });
}

function createContainerMutation(mutationFn: (id: string) => Promise<unknown>) {
  return function useContainerMutation() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn,
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: containersQueryKey });
        await queryClient.invalidateQueries({ queryKey: engineQueryKey });
      },
    });
  };
}

function createComposeProjectMutation(mutationFn: (project: string) => Promise<void>) {
  return function useComposeProjectMutation() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn,
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: containersQueryKey });
        await queryClient.invalidateQueries({ queryKey: engineQueryKey });
      },
    });
  };
}

export const useStartContainer = createContainerMutation(startContainer);
export const useStopContainer = createContainerMutation(stopContainer);
export const useRestartContainer = createContainerMutation(restartContainer);
export const useRemoveContainer = createContainerMutation(removeContainer);
export const useStartComposeProject = createComposeProjectMutation(startComposeProject);
export const useStopComposeProject = createComposeProjectMutation(stopComposeProject);
export const useRemoveComposeProject = createComposeProjectMutation(removeComposeProject);

export const useRebuildContainer = createContainerMutation(rebuildContainer);
