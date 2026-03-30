import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEngineInfo } from "@/lib/api/resources";

export const engineQueryKey = ["engine"] as const;

export function useEngineInfo() {
  return useQuery({
    queryKey: engineQueryKey,
    queryFn: () => getEngineInfo(),
    refetchInterval: 30000,
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
