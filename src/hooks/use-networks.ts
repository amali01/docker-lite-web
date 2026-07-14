import { createNetwork, listNetworks, removeNetwork } from "@/lib/api/resources";
import { useInvalidatingMutation, useResourceList } from "@/hooks/resource-query";

export const networksQueryKey = ["networks"] as const;

export function useNetworks() {
  return useResourceList(networksQueryKey, listNetworks);
}

export function useCreateNetwork() {
  return useInvalidatingMutation(networksQueryKey, createNetwork);
}

export function useRemoveNetwork() {
  return useInvalidatingMutation(networksQueryKey, removeNetwork);
}
