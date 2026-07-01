import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser, ApiUserRole } from '../lib/types';
import {
  apiSignIn,
  apiSignUp,
  apiSignOut,
  apiGetMe,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from '../lib/api';

// ── Context shape ───────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, allowedRoles?: ApiUserRole[]) => Promise<void>;
  signup: (email: string, password: string, fullName: string, role: ApiUserRole, allowedRoles?: ApiUserRole[]) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [loading, setLoading] = useState(true);

  // Restore session from stored token on mount
  useEffect(() => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      setLoading(false);
      return;
    }
    apiGetMe()
      .then((me) => {
        setUser(me);
        setToken(storedToken);
      })
      .catch(() => {
        // Token is invalid/expired — clear it
        clearStoredToken();
        setUser(null);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, allowedRoles?: ApiUserRole[]) => {
    const result = await apiSignIn(email, password);
    if (allowedRoles && !allowedRoles.includes(result.user.role)) {
      throw new Error(`Access denied: You do not have permission to access the selected panel.`);
    }
    setStoredToken(result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName: string, role: ApiUserRole, allowedRoles?: ApiUserRole[]) => {
    const result = await apiSignUp(email, password, fullName, role);
    if (allowedRoles && !allowedRoles.includes(result.user.role)) {
      throw new Error(`Access denied: You do not have permission to access the selected panel.`);
    }
    setStoredToken(result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiSignOut();
    } catch {
      // Best effort — clear local state regardless
    }
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
