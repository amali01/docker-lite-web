import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEngineTarget,
  deleteEngineTarget,
  getEngineInfo,
  listEngineTargets,
  retestEngineTarget,
  selectEngineTarget,
  testEngineTarget,
  updateEngineTarget,
} from "@/lib/api/resources";
import type {
  CreateEngineTargetPayload,
  TestEngineTargetPayload,
  UpdateEngineTargetPayload,
} from "@/lib/api/types";

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

function invalidateEngineState(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: engineQueryKey }),
    queryClient.invalidateQueries({ queryKey: engineTargetsQueryKey }),
  ]);
}

function invalidateEngineTargets(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: engineTargetsQueryKey });
}

export function useCreateEngineTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateEngineTargetPayload) => createEngineTarget(payload),
    onSuccess: async () => {
      await invalidateEngineState(queryClient);
    },
  });
}

export function useUpdateEngineTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetId, payload }: { targetId: string; payload: UpdateEngineTargetPayload }) =>
      updateEngineTarget(targetId, payload),
    onSuccess: async () => {
      await invalidateEngineState(queryClient);
    },
  });
}

export function useDeleteEngineTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteEngineTarget,
    onSuccess: async () => {
      await invalidateEngineState(queryClient);
    },
  });
}

export function useTestEngineTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TestEngineTargetPayload) => testEngineTarget(payload),
    onSuccess: async () => {
      await invalidateEngineTargets(queryClient);
    },
  });
}

export function useRetestEngineTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retestEngineTarget,
    onSuccess: async () => {
      await invalidateEngineTargets(queryClient);
    },
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
