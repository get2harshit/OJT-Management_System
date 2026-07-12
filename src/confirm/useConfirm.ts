import { useContext } from 'react';
import { ConfirmContext } from './ConfirmContext';
import type { ConfirmFn } from './ConfirmContext';

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx.confirm;
}
