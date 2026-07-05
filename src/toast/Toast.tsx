import { CheckCircle2, XCircle, X } from 'lucide-react';
import type { ToastVariant } from './types';

interface ToastProps {
  message: string;
  variant: ToastVariant;
  onDismiss: () => void;
}

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: typeof CheckCircle2; iconColor: string }> = {
  success: { border: 'border-gold/30', icon: CheckCircle2, iconColor: 'text-gold' },
  error: { border: 'border-red-500/30', icon: XCircle, iconColor: 'text-red-400' },
};

// Single toast card: the visual, no state. ToastProvider owns the list and timing.
export default function Toast({ message, variant, onDismiss }: ToastProps) {
  const { border, icon: Icon, iconColor } = VARIANT_STYLES[variant];

  return (
    <div
      className={`flex items-start gap-2.5 bg-zinc-850 border ${border} rounded-lg shadow-2xl px-4 py-3 max-w-sm animate-in slide-in-from-bottom-2 fade-in duration-200`}
    >
      <Icon size={18} className={`${iconColor} shrink-0 mt-0.5`} />
      <p className="text-sm text-white leading-snug">{message}</p>
      <button onClick={onDismiss} className="text-gray-500 hover:text-white transition-colors shrink-0 ml-1">
        <X size={15} />
      </button>
    </div>
  );
}
