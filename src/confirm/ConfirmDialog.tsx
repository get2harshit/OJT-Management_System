import { useEffect } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Button from '../components/Button';
import type { ConfirmVariant } from './types';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

// The single on-screen dialog ConfirmProvider renders — replaces
// window.confirm() so confirmations match the rest of the app's UI
// instead of the browser's native alert box.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const Icon = variant === 'danger' ? AlertTriangle : HelpCircle;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-zinc-850 border border-zinc-750 rounded-xl w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200 p-5">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full shrink-0 ${variant === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-gold/10 text-gold'}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-semibold text-base">{title}</h3>
            <p className="text-gray-400 text-sm mt-1 whitespace-pre-line">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="secondary" size="sm" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={variant === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
