import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { NotificationItem } from '../components/NotificationCenter';

type NavigateFn = (n: NotificationItem) => void;

interface NotificationNavigateContextType {
  // Called by the currently-mounted panel to hand over its own "go to
  // whatever this notification is about" handler; only the most recently
  // registered one is kept, matching RefreshContext's same one-active-page
  // assumption. Returns an unregister callback for the panel's cleanup effect.
  registerNavigate: (fn: NavigateFn) => () => void;
  navigateFromNotification: (n: NotificationItem) => void;
}

const NotificationNavigateContext = createContext<NotificationNavigateContextType | undefined>(undefined);

export function NotificationNavigateProvider({ children }: { children: React.ReactNode }) {
  const navigateFnRef = useRef<NavigateFn | null>(null);

  const registerNavigate = useCallback((fn: NavigateFn) => {
    navigateFnRef.current = fn;
    return () => {
      if (navigateFnRef.current === fn) {
        navigateFnRef.current = null;
      }
    };
  }, []);

  const navigateFromNotification = useCallback((n: NotificationItem) => {
    navigateFnRef.current?.(n);
  }, []);

  return (
    <NotificationNavigateContext.Provider value={{ registerNavigate, navigateFromNotification }}>
      {children}
    </NotificationNavigateContext.Provider>
  );
}

export function useNotificationNavigateContext() {
  const context = useContext(NotificationNavigateContext);
  if (!context) {
    throw new Error('useNotificationNavigateContext must be used within a NotificationNavigateProvider');
  }
  return context;
}

// Each panel (admin/mentor/student index.tsx) calls this with its own
// notification-type -> tab/focus-state mapping, since each has a different
// set of tabs and a different local "focus" shape. Re-registers whenever
// `fn`'s identity changes so the handler always sees the panel's latest
// setActiveTab/setFocus closures.
export function useNotificationNavigate(fn: NavigateFn) {
  const { registerNavigate } = useNotificationNavigateContext();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    return registerNavigate((n) => fnRef.current(n));
  }, [registerNavigate]);
}
