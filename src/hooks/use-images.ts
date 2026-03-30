import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listImages, pullImage, removeImage } from "@/lib/api/resources";

export const imagesQueryKey = ["images"] as const;

export function useImages() {
  return useQuery({
    queryKey: imagesQueryKey,
    queryFn: listImages,
    refetchInterval: 30000,
  });
}

export function usePullImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pullImage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: imagesQueryKey });
    },
  });
}

export function useRemoveImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeImage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: imagesQueryKey });
    },
  });
}
