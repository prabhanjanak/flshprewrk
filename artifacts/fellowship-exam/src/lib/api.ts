const API_BASE = (import.meta.env.VITE_API_URL as string) || "/api";

export type Role =
  | "super_admin"
  | "program_admin"
  | "central_exam_coordinator"
  | "exam_coordinator"
  | "unit_coordinator"
  | "doctor"
  | "student";

export interface User {
  id: number;
  email: string;
  salutation: string | null;
  fullName: string;
  employeeId: string | null;
  designation: string | null;
  gender: string | null;
  avatarSeed: string | null;
  role: Role;
  unitId: number | null;
  unitName: string | null;
  programId: number | null;
  forcePasswordReset: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.error || body?.message || `API Error (${status})`);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("fellowship_token") : null;
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("fellowship_token", token);
  }
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("fellowship_token");
  }
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  skipRetry?: boolean;
}

async function fetchWithTimeout(url: string, options: RequestOptions, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please check your network connection and try again.");
    }
    if (err.message && (err.message.includes("Failed to fetch") || err.message.includes("Load failed") || err.message.includes("NetworkError"))) {
      throw new Error("Unable to connect to the examination server. Please verify your connection.");
    }
    throw err;
  }
}

async function fetchWithRetry(url: string, options: RequestOptions, retries = 2, delay = 1000): Promise<Response> {
  const isSafeMethod = !options.method || options.method.toUpperCase() === "GET" || options.method.toUpperCase() === "HEAD";
  const effectiveRetries = (isSafeMethod && !options.skipRetry) ? retries : 0;

  try {
    return await fetchWithTimeout(url, options, options.timeoutMs);
  } catch (err: any) {
    if (effectiveRetries > 0) {
      console.warn(`Safe request retry: ${err.message}. Retrying in ${delay}ms... (${effectiveRetries} left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, effectiveRetries - 1, delay * 2);
    }
    throw err;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetchWithRetry(`${API_BASE}${path}`, { ...options, headers });
    
    if (res.status === 401) {
      // Clear token on definitive 401
      if (!path.includes("/auth/login") && !path.includes("/auth/me")) {
        console.warn("Session expired or unauthorized request to:", path);
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText || `HTTP ${res.status}` }));
      throw new ApiError(res.status, body);
    }

    // Safely parse JSON — guard against empty bodies (e.g. 204 No Content)
    const text = await res.text().catch(() => "");
    if (!text || text.trim() === "") return null as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null as unknown as T;
    }
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new Error(err.message || "Network error. Please try again.");
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: "GET", ...options }),
  getBlob: async (path: string, options?: RequestOptions): Promise<Blob> => {
    const token = getToken();
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string> ?? {}),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    const res = await fetchWithRetry(`${API_BASE}${path}`, {
      method: "GET",
      timeoutMs: 45000,
      ...options,
      headers
    });
    
    if (!res.ok) {
      throw new Error(`Failed to download asset (${res.status} ${res.statusText})`);
    }
    return res.blob();
  },
  post: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), ...options }),
  put: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body), ...options }),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), ...options }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: "DELETE", ...options }),
  delete_body: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: "DELETE", body: JSON.stringify(body), ...options }),
};

