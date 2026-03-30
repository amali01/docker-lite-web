import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEngineInfo, listEngineTargets, selectEngineTarget } from "@/lib/api/resources";

export const engineQueryKey = ["engine"] as const;
export const engineTargetsQueryKey = ["engine-targets"] as const;

export function useEngineInfo() {
  return useQuery({
    queryKey: engineQueryKey,
    queryFn: () => getEngineInfo(),
    refetchInterval: 30000,
  });
}

export function useEngineTargets() {
  return useQuery({
    queryKey: engineTargetsQueryKey,
    queryFn: listEngineTargets,
  });
}

export function useTestEngineConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (baseUrl?: string) => getEngineInfo(baseUrl),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: engineQueryKey });
    },
  });
}

export function useSelectEngineTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: selectEngineTarget,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: engineQueryKey });
      await queryClient.invalidateQueries({ queryKey: engineTargetsQueryKey });
      await queryClient.invalidateQueries();
    },
  });
}
