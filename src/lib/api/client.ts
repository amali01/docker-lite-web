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
  const { baseUrl, auth, headers: callerHeaders, ...rest } = init ?? {};
  const includeAuth = auth ?? false;

  // Caller headers merge over the defaults (Accept/Content-Type: caller wins,
  // matching normal fetch-wrapper convention), but the bearer token is applied
  // last so a caller can never silently override or drop it when `auth: true`
  // was requested.
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...callerHeaders,
    ...(includeAuth && authRuntimeState.token ? { Authorization: `Bearer ${authRuntimeState.token}` } : {}),
  };

  const response = await fetch(`${baseUrl ?? getApiBaseUrl()}${path}`, {
    ...rest,
    headers,
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
 * Builds the URL for a stream without any credential on it. This is the single
 * seam that owns base-URL resolution and the http→ws protocol flip for both
 * stream kinds. It has no `http` transport on purpose: ordinary fetch requests
 * keep their Bearer header (see apiRequest) and must never carry a credential
 * in the URL.
 */
export function resolveStreamEndpoint(path: string, transport: "sse" | "websocket" = "sse"): URL {
  // Resolve against the page origin so a relative or empty base URL
  // (same-origin deploy, or a "/prefix" configured in Settings) still yields a
  // valid absolute URL instead of throwing. An absolute base ignores the origin.
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const httpUrl = new URL(`${getApiBaseUrl()}${path}`, origin);

  const url =
    transport === "websocket"
      ? new URL(
          `${httpUrl.protocol === "https:" ? "wss:" : "ws:"}//${httpUrl.host}${httpUrl.pathname}${httpUrl.search}`,
        )
      : httpUrl;

  return url;
}

/**
 * EventSource and WebSocket cannot set an Authorization header. Rather than put
 * the long-lived bearer token in the URL — where it lands in server access
 * logs, proxy logs and browser history — mint a single-use, short-TTL ticket
 * over a normal authenticated request and spend that instead. Every connection
 * attempt, reconnects included, needs its own ticket: the server invalidates
 * one the moment it is redeemed.
 */
export async function attachStreamTicket(url: URL): Promise<URL> {
  // No token means either auth-bypass mode (a loopback server with login
  // disabled authenticates every request anyway) or a signed-out client.
  // Neither can mint a ticket, and the first does not need one.
  if (!authRuntimeState.token) {
    return url;
  }

  const { ticket } = await apiRequest<{ ticket: string; expiresAt: string }>("/api/auth/stream-ticket", {
    method: "POST",
    auth: true,
  });

  url.searchParams.set("ticket", ticket);

  return url;
}
