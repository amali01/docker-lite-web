import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useContainerStats(containerId?: string) {
  const engineQuery = useEngineInfo();
  const selectedEngineId = engineQuery.data?.selectedEngineId ?? null;

  return useQuery({
    queryKey: ["container-stats", selectedEngineId, containerId ?? null] as const,
    queryFn: () => getContainerStats(containerId ?? ""),
    enabled: Boolean(selectedEngineId && containerId),
  });
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
