// Which backend — and so which database — this bundle talks to.
//
// Supplied per environment and never defaulted; see lib/env.ts for why a
// fallback here is the specific mistake that put production on staging data.
// For a local backend, set VITE_API_BASE_URL=http://localhost:8080 in
// .env.local.
import { requiredEnv } from '../env';

export const API_BASE = requiredEnv('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL);

const TOKEN_KEY = 'ojt-auth-token';

export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearStoredToken = () => localStorage.removeItem(TOKEN_KEY);

// ── Request cache ────────────────────────────────────────────────────────────
// Short-TTL cache + in-flight dedup for read endpoints that multiple
// components fetch independently (e.g. several cohort sub-pages each
// loading the same cohort on mount). Keeps two calls for the same key that
// land within the TTL window down to one network request. Mutators should
// call invalidateCached() for any key their write makes stale.

interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  inFlight?: Promise<T>;
}

const requestCache = new Map<string, CacheEntry<unknown>>();

export function cachedFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = requestCache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (entry?.inFlight) return entry.inFlight;
  if (entry && entry.expiresAt > now) return Promise.resolve(entry.value as T);

  const inFlight = fetcher()
    .then((value) => {
      requestCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      requestCache.delete(key);
      throw err;
    });

  requestCache.set(key, { expiresAt: 0, inFlight });
  return inFlight;
}

// Deletes exact key matches and any key namespaced under `${prefix}:`.
export function invalidateCached(prefix: string): void {
  for (const key of requestCache.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      requestCache.delete(key);
    }
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  // FormData bodies must let the browser set their own multipart boundary —
  // forcing application/json here would break file uploads.
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // 204 No Content (e.g., successful delete)
  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401) {
      clearStoredToken();
      window.dispatchEvent(new Event('ojt-unauthorized'));
    }
    const msg = body?.message || body?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return body as T;
}
