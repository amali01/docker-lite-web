import { listImages, pullImage, removeImage } from "@/lib/api/resources";
import { useInvalidatingMutation, useResourceList } from "@/hooks/resource-query";

export const imagesQueryKey = ["images"] as const;

export function useImages() {
  return useResourceList(imagesQueryKey, listImages);
}

export function usePullImage() {
  return useInvalidatingMutation(imagesQueryKey, pullImage);
}

export function useRemoveImage() {
  return useInvalidatingMutation(imagesQueryKey, removeImage);
}
