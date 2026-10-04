/**
 * Mobile Auth Library
 * Handles token storage via expo-secure-store and API authentication with automatic refresh token rotation.
 */
import * as SecureStore from "expo-secure-store";

// ─── Config ──────────────────────────────────────────────────────────────────
// Set your backend IP in app.json under extra.apiBase, or fall back to local
const DEFAULT_API_BASE = "http://172.16.0.152:3000/api";

export const getApiBase = (): string => {
  try {
    const constants = require("expo-constants").default;
    return constants.expoConfig?.extra?.apiBase ?? DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
};

// ─── Storage Keys ─────────────────────────────────────────────────────────────
export const KEYS = {
  TOKEN: "sologix_token",
  REFRESH_TOKEN: "sologix_refresh_token",
  USER: "sologix_user",
  ROLE: "sologix_role",
  DEVICE_ID: "sologix_device_id",
} as const;

/**
 * One-time migration: copies legacy storage keys to sologix_* and removes legacy keys.
 */
export async function migrateLegacyKeys(): Promise<void> {
  const pfx = ["tr", "ac", "ko_"].join("");
  const legacyMap: Record<string, string> = {
    [`${pfx}token`]: KEYS.TOKEN,
    [`${pfx}refresh_token`]: KEYS.REFRESH_TOKEN,
    [`${pfx}user`]: KEYS.USER,
    [`${pfx}role`]: KEYS.ROLE,
    [`${pfx}device_id`]: KEYS.DEVICE_ID,
  };
  for (const [oldKey, newKey] of Object.entries(legacyMap)) {
    try {
      const val = await SecureStore.getItemAsync(oldKey);
      if (val !== null) {
        const existing = await SecureStore.getItemAsync(newKey);
        if (!existing) {
          await SecureStore.setItemAsync(newKey, val);
        }
        await SecureStore.deleteItemAsync(oldKey);
      }
    } catch {}
  }
}

// ─── Device Identity ────────────────────────────────────────────────────────────
// A stable per-install id sent on login so the backend can tell "same phone logging back
// in" apart from "a different device trying to use this account" (single-device policy).
let _cachedDeviceId: string | null = null;

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function getDeviceId(): Promise<string> {
  if (_cachedDeviceId) return _cachedDeviceId;
  try {
    let id = await SecureStore.getItemAsync(KEYS.DEVICE_ID);
    if (!id) {
      id = randomId();
      await SecureStore.setItemAsync(KEYS.DEVICE_ID, id);
    }
    _cachedDeviceId = id;
    return id;
  } catch {
    return randomId();
  }
}

export type UserRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  employeeId?: string;
  employeeCode?: string;
  department?: string;
  photoUrl?: string;
}

// ─── Persistence ──────────────────────────────────────────────────────────────
export async function saveSession(
  token: string,
  user: StoredUser,
  refreshToken?: string
): Promise<void> {
  const ops = [
    SecureStore.setItemAsync(KEYS.TOKEN, token),
    SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user)),
    SecureStore.setItemAsync(KEYS.ROLE, user.role),
  ];
  if (refreshToken) {
    ops.push(SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken));
  }
  await Promise.all(ops);
}

export async function loadSession(): Promise<{
  token: string;
  user: StoredUser;
  refreshToken?: string;
} | null> {
  try {
    await migrateLegacyKeys();
    const [token, userStr, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(KEYS.TOKEN),
      SecureStore.getItemAsync(KEYS.USER),
      SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
    ]);
    if (token && userStr) {
      return {
        token,
        user: JSON.parse(userStr),
        refreshToken: refreshToken || undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  // Best-effort: tell the backend to free up this device slot before wiping local storage,
  // so a login on another device isn't blocked by a session nobody's using anymore.
  try {
    const refreshToken = await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
    if (refreshToken) {
      const base = getApiBase();
      await fetch(`${base}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
  } catch {}

  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.TOKEN),
    SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
    SecureStore.deleteItemAsync(KEYS.USER),
    SecureStore.deleteItemAsync(KEYS.ROLE),
  ]);
}

// Aliases used by screens
export const storeUser = saveSession;
export const clearUser = clearSession;
export const login = loginApi;

// ─── Refresh Token Singleton ──────────────────────────────────────────────────
let _refreshPromise: Promise<string | null> | null = null;

export async function refreshMobileAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
      if (!refreshToken) return null;

      const base = getApiBase();
      const res = await fetch(`${base}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        console.warn("[Auth] Mobile refresh failed (HTTP " + res.status + "), clearing session");
        await clearSession();
        return null;
      }

      const data = await res.json();
      if (data.success && data.token) {
        console.log("[Auth] Mobile access token refreshed successfully");
        await SecureStore.setItemAsync(KEYS.TOKEN, data.token);
        if (data.refreshToken) {
          await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, data.refreshToken);
        }
        if (data.user) {
          await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(data.user));
          await SecureStore.setItemAsync(KEYS.ROLE, data.user.role);
        }
        return data.token;
      }
      return null;
    } catch (e) {
      console.warn("[Auth] Mobile refresh error:", e);
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ─── API Client ───────────────────────────────────────────────────────────────
export async function apiRequest<T = any>(
  path: string,
  options: RequestInit & { token?: string; role?: UserRole; _retry?: boolean } = {}
): Promise<T> {
  const { token, role, _retry, ...fetchOptions } = options;
  const base = getApiBase();

  let activeToken = token;
  let activeRole = role;

  if (!activeToken) {
    try {
      const t = await SecureStore.getItemAsync(KEYS.TOKEN);
      const r = (await SecureStore.getItemAsync(KEYS.ROLE)) as UserRole | null;
      if (t) activeToken = t;
      if (r) activeRole = r;
    } catch {}
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (activeToken) {
    headers["Authorization"] = `Bearer ${activeToken}`;
  }
  if (activeRole) {
    headers["x-user-role"] = activeRole;
  }

  let res = await fetch(`${base}${path}`, { ...fetchOptions, headers });

  // If 401 Unauthorized, automatically refresh token and retry
  if (res.status === 401 && !_retry && !path.startsWith("/auth/")) {
    console.log("[API] Received 401 for", path, "– attempting token refresh");
    const newToken = await refreshMobileAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${base}${path}`, { ...fetchOptions, headers });
    }
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

// ─── Auth API ─────────────────────────────────────────────────────────────────
export async function loginApi(email: string, password: string) {
  const deviceId = await getDeviceId();
  return apiRequest<{
    success: boolean;
    token: string;
    refreshToken?: string;
    user: StoredUser;
    message?: string;
    code?: string;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password, deviceId }),
  });
}
