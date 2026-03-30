import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listContainers,
  removeContainer,
  restartContainer,
  runContainer,
  startContainer,
  stopContainer,
} from "@/lib/api/resources";

export const containersQueryKey = ["containers"] as const;

export function useContainers() {
  return useQuery({
    queryKey: containersQueryKey,
    queryFn: listContainers,
    refetchInterval: 10000,
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
        await queryClient.invalidateQueries({ queryKey: ["engine"] });
      },
    });
  };
}

export const useStartContainer = createContainerMutation(startContainer);
export const useStopContainer = createContainerMutation(stopContainer);
export const useRestartContainer = createContainerMutation(restartContainer);
export const useRemoveContainer = createContainerMutation(removeContainer);
