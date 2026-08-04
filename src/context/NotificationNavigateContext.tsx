import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
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
    // Last-write-wins is deliberate — exactly one page's content is on screen
    // — but nothing enforces it, and a second registration silently disables
    // the first. Now that sections are nested routes it is easy to end up
    // with a page and something inside it both registering, and the symptom
    // (clicking a notification going nowhere) gives no hint where to look.
    if (import.meta.env.DEV && navigateFnRef.current) {
      console.warn(
        '[NotificationNavigateContext] A second handler was registered while one was still active. ' +
          'Only the most recent one runs; the earlier one is now dead.'
      );
    }
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

  const value = useMemo(
    () => ({ registerNavigate, navigateFromNotification }),
    [registerNavigate, navigateFromNotification]
  );

  return <NotificationNavigateContext.Provider value={value}>{children}</NotificationNavigateContext.Provider>;
}

export function useNotificationNavigateContext() {
  const context = useContext(NotificationNavigateContext);
  if (!context) {
    throw new Error('useNotificationNavigateContext must be used within a NotificationNavigateProvider');
  }
  return context;
}

// Each panel (admin/mentor/student index.tsx) calls this with its own
// notification-type -> section/focus-state mapping, since each has a different
// set of sections and a different local "focus" shape. Re-registers whenever
// `fn`'s identity changes so the handler always sees the panel's latest
// navigate/setFocus closures.
export function useNotificationNavigate(fn: NavigateFn) {
  const { registerNavigate } = useNotificationNavigateContext();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    return registerNavigate((n) => fnRef.current(n));
  }, [registerNavigate]);
}
