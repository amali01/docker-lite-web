import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNetwork, listNetworks, removeNetwork } from "@/lib/api/resources";

export const networksQueryKey = ["networks"] as const;

export function useNetworks() {
  return useQuery({
    queryKey: networksQueryKey,
    queryFn: listNetworks,
    refetchInterval: 30000,
  });
}

export function useCreateNetwork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createNetwork,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: networksQueryKey });
    },
  });
}

export function useRemoveNetwork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeNetwork,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: networksQueryKey });
    },
  });
}
