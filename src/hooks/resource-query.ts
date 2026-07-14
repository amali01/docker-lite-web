import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

/**
 * Shared TanStack Query shape for the simple resource lists (images, volumes,
 * networks) that were three near-identical hook modules. The interface is a
 * list query plus an invalidate-on-success mutation; per-resource variation
 * (an optimistic cache update, for example) crosses the seam through the
 * optional `onSuccess` callback, which runs before the invalidation.
 */

const RESOURCE_REFETCH_INTERVAL_MS = 30000;

export function useResourceList<T>(queryKey: QueryKey, queryFn: () => Promise<T>) {
  return useQuery({
    queryKey,
    queryFn,
    refetchInterval: RESOURCE_REFETCH_INTERVAL_MS,
  });
}

export function useInvalidatingMutation<TData, TVars>(
  queryKey: QueryKey,
  mutationFn: (vars: TVars) => Promise<TData>,
  onSuccess?: (queryClient: QueryClient, data: TData, vars: TVars) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data, vars) => {
      onSuccess?.(queryClient, data, vars);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}
