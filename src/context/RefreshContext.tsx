import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type RefreshFn = () => void | Promise<unknown>;

interface RefreshContextType {
  // Called by the currently-mounted page to hand over its own reload
  // function; only the most recently registered one is kept, since exactly
  // one page's content is ever on screen at a time. Returns an unregister
  // callback for the page's cleanup effect.
  registerRefresh: (fn: RefreshFn) => () => void;
  refreshCurrentPage: () => Promise<void>;
  isRefreshing: boolean;
}

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const refreshFnRef = useRef<RefreshFn | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const registerRefresh = useCallback((fn: RefreshFn) => {
    refreshFnRef.current = fn;
    return () => {
      if (refreshFnRef.current === fn) {
        refreshFnRef.current = null;
      }
    };
  }, []);

  const refreshCurrentPage = useCallback(async () => {
    const fn = refreshFnRef.current;
    if (!fn) return;
    setIsRefreshing(true);
    try {
      await fn();
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <RefreshContext.Provider value={{ registerRefresh, refreshCurrentPage, isRefreshing }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefreshContext() {
  const context = useContext(RefreshContext);
  if (!context) {
    throw new Error('useRefreshContext must be used within a RefreshProvider');
  }
  return context;
}

// Pages call this with their own "reload everything" function. Re-registers
// whenever `fn`'s identity changes (e.g. it closes over new filter state) so
// the header button always calls the page's latest reload logic, and
// unregisters on unmount so a stale page's refresh can't fire after
// navigating away.
export function usePageRefresh(fn: RefreshFn) {
  const { registerRefresh } = useRefreshContext();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    return registerRefresh(() => fnRef.current());
  }, [registerRefresh]);
}
