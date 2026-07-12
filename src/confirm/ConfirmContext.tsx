import { createContext, useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ConfirmDialog from './ConfirmDialog';
import type { ConfirmOptions } from './types';

export type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

export interface ConfirmContextValue {
  confirm: ConfirmFn;
}

export const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface ActiveConfirm extends Required<Omit<ConfirmOptions, 'title'>> {
  title: string;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveConfirm | null>(null);
  // Holds the promise resolver for whichever confirm() call is currently
  // showing the dialog — settled by the user's choice, not by unmounting.
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setActive({
        title: opts.title ?? 'Are you sure?',
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        variant: opts.variant ?? 'default',
      });
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setActive(null);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        open={active !== null}
        title={active?.title ?? ''}
        message={active?.message ?? ''}
        confirmLabel={active?.confirmLabel ?? 'Confirm'}
        cancelLabel={active?.cancelLabel ?? 'Cancel'}
        variant={active?.variant ?? 'default'}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}
