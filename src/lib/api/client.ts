import { ApiErrorResponse } from "./types";

const LOCAL_STORAGE_KEY = "docklite.api-base-url";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:9001";

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
};

export async function apiRequest<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const response = await fetch(`${init?.baseUrl ?? getApiBaseUrl()}${path}`, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
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

export function createStreamUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}
