import { createVolume, listVolumes, removeVolume } from "@/lib/api/resources";
import { useInvalidatingMutation, useResourceList } from "@/hooks/resource-query";
import type { VolumeSummary } from "@/lib/api/types";

export const volumesQueryKey = ["volumes"] as const;

export function useVolumes() {
  return useResourceList(volumesQueryKey, listVolumes);
}

export function useCreateVolume() {
  return useInvalidatingMutation(volumesQueryKey, createVolume);
}

export function useRemoveVolume() {
  // Optimistically drop the removed volume before the list refetch settles.
  return useInvalidatingMutation(volumesQueryKey, removeVolume, (queryClient, _result, volumeName) => {
    queryClient.setQueryData<VolumeSummary[]>(volumesQueryKey, (current = []) =>
      current.filter((volume) => volume.name !== volumeName),
    );
  });
}
