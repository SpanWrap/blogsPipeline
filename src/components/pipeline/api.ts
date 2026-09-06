export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  onUnauthorized?: () => void,
): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/me" && path !== "/api/setup") {
    onUnauthorized?.();
    throw new ApiError((data as { error?: string }).error || "Sign in required");
  }
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || res.statusText || "Request failed");
  }
  return data as T;
}
