import { getToken } from "../../lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let mergedHeaders: HeadersInit = {
    ...defaultHeaders,
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    mergedHeaders = {
      ...mergedHeaders,
      Authorization: `Bearer ${token}`,
    };
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: mergedHeaders,
  });

  let parsed: ApiResponse<T> | T;

  try {
    parsed = await response.json();
  } catch {
    parsed = {} as T;
  }

  if (!response.ok) {
    const body = parsed as ApiResponse<T>;
    const errorMessage = body?.error ?? response.statusText;
    throw new Error(errorMessage);
  }

  const body = parsed as ApiResponse<T>;
  return (body.data ?? body) as T;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
  token: string;
}

export interface AppConfigPayload {
  name: string;
  slug: string;
  config: object;
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(
  email: string,
  password: string,
  name?: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export function getMe(): Promise<{ id: string; email: string; name: string | null; role: string }> {
  return apiRequest("/api/auth/me");
}

export function getApps(): Promise<unknown> {
  return apiRequest("/api/config");
}

export function getApp(slug: string): Promise<unknown> {
  return apiRequest(`/api/config/${encodeURIComponent(slug)}`);
}

export function createApp(data: AppConfigPayload): Promise<unknown> {
  return apiRequest("/api/config", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateApp(slug: string, config: object): Promise<unknown> {
  return apiRequest(`/api/config/${encodeURIComponent(slug)}`, {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
}

export function deleteApp(slug: string): Promise<unknown> {
  return apiRequest(`/api/config/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export function getRuntimeData(slug: string, entity: string): Promise<unknown> {
  return apiRequest(`/api/runtime/${encodeURIComponent(slug)}/${encodeURIComponent(entity)}`);
}

export function createRuntimeRecord(
  slug: string,
  entity: string,
  data: object,
): Promise<unknown> {
  return apiRequest(`/api/runtime/${encodeURIComponent(slug)}/${encodeURIComponent(entity)}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateRuntimeRecord(
  slug: string,
  entity: string,
  id: string,
  data: object,
): Promise<unknown> {
  return apiRequest(
    `/api/runtime/${encodeURIComponent(slug)}/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

export function deleteRuntimeRecord(
  slug: string,
  entity: string,
  id: string,
): Promise<unknown> {
  return apiRequest(
    `/api/runtime/${encodeURIComponent(slug)}/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

export function getNotifications(): Promise<unknown> {
  return apiRequest("/api/notifications");
}

export function markNotificationRead(id: string): Promise<unknown> {
  return apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsRead(): Promise<unknown> {
  return apiRequest("/api/notifications/read-all", {
    method: "PATCH",
  });
}
