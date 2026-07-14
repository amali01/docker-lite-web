import { ApiErrorResponse } from "./types";

const LOCAL_STORAGE_KEY = "docklite.api-base-url";
const AUTH_TOKEN_STORAGE_KEY = "docklite.auth-token";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:9001";

type AuthRuntimeState = {
  token: string | null;
};

const authRuntimeState: AuthRuntimeState = {
  token: typeof window === "undefined" ? null : window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY),
};

export class ApiClientError extends Error {
  code: string;
  details?: string;

  constructor(message: string, code = "unknown_error", details?: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.details = details;
  }
}

export function setAuthRuntimeState(state: Partial<AuthRuntimeState>) {
  if (typeof state.token !== "undefined") {
    authRuntimeState.token = state.token;

    if (typeof window !== "undefined") {
      if (state.token) {
        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, state.token);
      } else {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      }
    }
  }
}

export function resetAuthRuntimeState() {
  authRuntimeState.token = null;

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

export function getAuthToken() {
  return authRuntimeState.token;
}

export function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return DEFAULT_API_BASE_URL;
  }

  return window.localStorage.getItem(LOCAL_STORAGE_KEY) ?? DEFAULT_API_BASE_URL;
}

export function setApiBaseUrl(url: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (!url.trim()) {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(LOCAL_STORAGE_KEY, url.trim().replace(/\/+$/, ""));
}

type ApiRequestInit = RequestInit & {
  baseUrl?: string;
  auth?: boolean;
};

export async function apiRequest<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const includeAuth = init?.auth ?? false;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(includeAuth && authRuntimeState.token ? { Authorization: `Bearer ${authRuntimeState.token}` } : {}),
    ...init?.headers,
  };

  const response = await fetch(`${init?.baseUrl ?? getApiBaseUrl()}${path}`, {
    headers,
    ...init,
  });

  if (!response.ok) {
    let errorBody: ApiErrorResponse | undefined;

    try {
      errorBody = (await response.json()) as ApiErrorResponse;
    } catch {
      throw new ApiClientError(`Request failed with status ${response.status}`, "http_error");
    }

    throw new ApiClientError(
      errorBody.error.message,
      errorBody.error.code,
      errorBody.error.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Streaming transports (EventSource and WebSocket) cannot set an Authorization
 * header, so the auth token rides in the `access_token` query param. This is
 * the single seam that owns base-URL resolution, the http→ws protocol flip,
 * and query-token attachment for both stream kinds. It has no `http` transport
 * on purpose: ordinary fetch requests keep their Bearer header (see
 * apiRequest) and must never carry the token in the URL.
 */
export function resolveStreamEndpoint(path: string, transport: "sse" | "websocket" = "sse"): URL {
  const httpUrl = new URL(`${getApiBaseUrl()}${path}`);

  const url =
    transport === "websocket"
      ? new URL(
          `${httpUrl.protocol === "https:" ? "wss:" : "ws:"}//${httpUrl.host}${httpUrl.pathname}${httpUrl.search}`,
        )
      : httpUrl;

  if (authRuntimeState.token) {
    url.searchParams.set("access_token", authRuntimeState.token);
  }

  return url;
}

export function createStreamUrl(path: string) {
  return resolveStreamEndpoint(path, "sse").toString();
}
