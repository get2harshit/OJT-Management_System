import { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { AuthResult, AuthUser, ApiUserRole } from '../lib/types';
import {
  apiSignIn,
  apiSignUp,
  apiGoogleSignIn,
  apiSignOut,
  apiGetMe,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from '../lib/api';

// ── Context shape ───────────────────────────────────────────────────────────────

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, allowedRoles?: ApiUserRole[]) => Promise<AuthUser>;
  signup: (email: string, password: string, fullName: string, role: ApiUserRole, allowedRoles?: ApiUserRole[]) => Promise<AuthUser>;
  /** Finishes a Google redirect using the session Supabase put in the URL. */
  loginWithGoogle: (accessToken: string, refreshToken: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

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
        setUser({
          ...me,
          role: me.role ? (me.role.toLowerCase() as ApiUserRole) : 'student'
        });
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

  // Listen for global unauthorized events to clean up session
  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredToken();
      setToken(null);
      setUser(null);
    };
    window.addEventListener('ojt-unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('ojt-unauthorized', handleUnauthorized);
    };
  }, []);

  // Every way of signing in ends the same way: normalise the role, check it
  // against whatever panel the caller was aiming for, then store the session.
  // Kept in one place so a new sign-in method can't quietly skip the role
  // check or forget to store the token.
  const applySession = useCallback((result: AuthResult, allowedRoles?: ApiUserRole[]) => {
    const normalizedUser = {
      ...result.user,
      role: result.user.role ? (result.user.role.toLowerCase() as ApiUserRole) : 'student'
    };
    if (allowedRoles && !allowedRoles.includes(normalizedUser.role)) {
      throw new Error(`Access denied: You do not have permission to access the selected panel.`);
    }
    setStoredToken(result.accessToken);
    setToken(result.accessToken);
    setUser(normalizedUser);
    return normalizedUser;
  }, []);

  const login = useCallback(async (email: string, password: string, allowedRoles?: ApiUserRole[]) => {
    return applySession(await apiSignIn(email, password), allowedRoles);
  }, [applySession]);

  const signup = useCallback(async (email: string, password: string, fullName: string, role: ApiUserRole, allowedRoles?: ApiUserRole[]) => {
    return applySession(await apiSignUp(email, password, fullName, role), allowedRoles);
  }, [applySession]);

  // The backend does the real work here — verifying the token with Supabase
  // and refusing an address that isn't registered — so by the time this
  // resolves the session is no different from a password sign-in.
  const loginWithGoogle = useCallback(async (accessToken: string, refreshToken: string) => {
    return applySession(await apiGoogleSignIn(accessToken, refreshToken));
  }, [applySession]);

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

  // Memoised so the value only changes when the session does. Every action on
  // it is already a stable useCallback, so without this the one thing that
  // changed on a re-render was the object holding them — and every consumer of
  // auth, which is most of the app, re-rendered for it.
  const value = useMemo(
    () => ({ user, token, loading, login, signup, loginWithGoogle, logout }),
    [user, token, loading, login, signup, loginWithGoogle, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
