import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAuthConfig,
  getAuthSession,
  login,
  logout,
  setLoginRequired,
  updateCredentials,
} from "@/lib/api/resources";
import { resetAuthRuntimeState, setAuthRuntimeState } from "@/lib/api/client";
import type {
  AuthLoginPayload,
  UpdateCredentialsPayload,
} from "@/lib/api/types";

export const authSessionQueryKey = ["auth-session"] as const;
export const authConfigQueryKey = ["auth-config"] as const;

export function useAuthSession() {
  return useQuery({
    queryKey: authSessionQueryKey,
    queryFn: async () => {
      const session = await getAuthSession();

      if (!session.authenticated) {
        setAuthRuntimeState({ token: null });
      }

      return session;
    },
  });
}

export function useAuthConfig() {
  return useQuery({
    queryKey: authConfigQueryKey,
    queryFn: getAuthConfig,
  });
}

async function refreshAuth(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: authSessionQueryKey }),
    queryClient.invalidateQueries({ queryKey: authConfigQueryKey }),
  ]);
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AuthLoginPayload) => login(payload),
    onSuccess: async (session) => {
      setAuthRuntimeState({
        token: session.token,
      });
      await refreshAuth(queryClient);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      resetAuthRuntimeState();
      await refreshAuth(queryClient);
    },
  });
}

export function useSetLoginRequired() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (required: boolean) => setLoginRequired(required),
    onSuccess: async (config) => {
      // Re-enabling login revokes the server-side token, so drop any local token
      // too — the next session check then routes the user through the login page.
      if (config.loginRequired) {
        resetAuthRuntimeState();
      }
      await refreshAuth(queryClient);
    },
  });
}

export function useUpdateCredentials() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateCredentialsPayload) => updateCredentials(payload),
    onSuccess: async (session) => {
      setAuthRuntimeState({
        token: session.token,
      });
      await refreshAuth(queryClient);
    },
  });
}
