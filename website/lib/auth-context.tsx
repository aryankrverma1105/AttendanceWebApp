"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, migrateLegacyKeys } from "./api";

export type UserRole = "ADMIN" | "USER";

export interface AuthUser {
  id: string | number;
  name: string;
  email: string;
  role: UserRole;
  employeeId?: string;
  photoUrl?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  switchRole: (newRole: UserRole) => Promise<void>;
  logout: () => void;
  canAccess: (allowedRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Routes that don't require authentication */
const PUBLIC_ROUTES = ["/login"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>("ADMIN");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      migrateLegacyKeys();
      const savedToken = localStorage.getItem("sologix_token");
      let savedRole = localStorage.getItem("sologix_role") as string;
      const savedUserStr = localStorage.getItem("sologix_user");

      if (savedRole === "MANAGER" || savedRole === "EMPLOYEE") {
        savedRole = "USER";
        localStorage.setItem("sologix_role", "USER");
      }

      if (
        savedToken &&
        savedRole &&
        (savedRole === "ADMIN" || savedRole === "USER") &&
        savedUserStr
      ) {
        setToken(savedToken);
        setRole(savedRole as UserRole);
        const parsedUser = JSON.parse(savedUserStr);
        if (parsedUser.role === "MANAGER" || parsedUser.role === "EMPLOYEE") {
          parsedUser.role = "USER";
        }
        setUser(parsedUser);
      }
    } catch {
      // Ignore SSR / JSON parse errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Guard: redirect to login if not authenticated and not on a public route
  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_ROUTES.some((r) => pathname?.startsWith(r));
    if (!user && !isPublic) {
      router.push("/login");
    }
  }, [isLoading, user, pathname, router]);

  const _persist = (newToken: string, newUser: AuthUser, newRefreshToken?: string) => {
    localStorage.setItem("sologix_token", newToken);
    localStorage.setItem("sologix_role", newUser.role);
    localStorage.setItem("sologix_user", JSON.stringify(newUser));
    if (newRefreshToken) {
      localStorage.setItem("sologix_refresh_token", newRefreshToken);
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.login(email, password);
      if (res.success && res.user && res.token) {
        const newUser: AuthUser = { ...res.user, role: res.user.role as UserRole };
        setUser(newUser);
        setRole(newUser.role);
        setToken(res.token);
        _persist(res.token, newUser, res.refreshToken);
        return { success: true };
      }
      return { success: false, message: res.message || "Invalid credentials" };
    } catch (error: any) {
      return { success: false, message: error.message || "Failed to connect to server" };
    }
  };

  const switchRole = async (newRole: UserRole): Promise<void> => {
    try {
      const res = await api.demoLogin(newRole);
      if (res.success && res.user && res.token) {
        const newUser: AuthUser = { ...res.user, role: res.user.role as UserRole };
        setUser(newUser);
        setRole(newUser.role);
        setToken(res.token);
        _persist(res.token, newUser, res.refreshToken);
        return;
      }
    } catch (e) {
      console.warn("Demo login failed:", e);
    }
  };

  const logout = () => {
    // Best-effort: free up this device's session slot so a login elsewhere isn't blocked
    // by a session nobody's using anymore.
    const refreshToken = localStorage.getItem("sologix_refresh_token");
    if (refreshToken) {
      api.logout(refreshToken);
    }

    setUser(null);
    setToken(null);
    setRole("ADMIN");
    localStorage.removeItem("sologix_role");
    localStorage.removeItem("sologix_token");
    localStorage.removeItem("sologix_refresh_token");
    localStorage.removeItem("sologix_user");
    router.push("/login");
  };

  const canAccess = (allowedRoles: UserRole[]) => allowedRoles.includes(role);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        switchRole,
        logout,
        canAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
