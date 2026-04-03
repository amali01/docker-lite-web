import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createVolume, listVolumes, removeVolume } from "@/lib/api/resources";
import type { VolumeSummary } from "@/lib/api/types";

export const volumesQueryKey = ["volumes"] as const;

export function useVolumes() {
  return useQuery({
    queryKey: volumesQueryKey,
    queryFn: listVolumes,
    refetchInterval: 30000,
  });
}

export function useCreateVolume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createVolume,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: volumesQueryKey });
    },
  });
}

export function useRemoveVolume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeVolume,
    onSuccess: async (_result, volumeName) => {
      queryClient.setQueryData<VolumeSummary[]>(volumesQueryKey, (current = []) =>
        current.filter((volume) => volume.name !== volumeName),
      );
      await queryClient.invalidateQueries({ queryKey: volumesQueryKey });
    },
  });
}
